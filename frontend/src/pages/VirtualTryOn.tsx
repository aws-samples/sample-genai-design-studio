import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Stack,
  Typography,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  Checkbox,
  FormGroup,
  Slider,
  Alert,
  IconButton,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ClearIcon from '@mui/icons-material/Clear';
import ImageUpload from '../components/ImageUpload';
import ImageDisplay from '../components/ImageDisplay';
import MaskCreator from '../components/MaskCreator';
import {
  generateObjectNames,
  getPresignedUploadUrl,
  uploadFileToS3,
  getPresignedDownloadUrl,
  downloadImageFromS3,
  processNovaVTO,
} from '../hooks/api';
import { validateNovaVTORequest, getValidationErrors } from '../utils/validation';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../stores/appStore';

const VirtualTryOn: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  
  // Zustand Store
  const {
    vto: {
      modelImageFile,
      garmentImageFile,
      maskImageFile,
      modelImage,
      garmentImage,
      maskImage,
      generatedImages,
      selectedImageIndex,
      parameters: {
        maskType,
        maskPrompt,
        garmentClass,
        longSleeveStyle,
        tuckingStyle,
        outerLayerStyle,
        maskShape,
        maskShapePrompt,
        preserveBodyPose,
        preserveHands,
        preserveFace,
        mergeStyle,
        returnMask,
        numberOfImages,
        quality,
        cfgScale,
        seed,
      },
      isLoading,
      uploadProgress,
      processingProgress,
      downloadProgress,
      error,
    },
    setVTOModelImage,
    setVTOGarmentImage,
    setVTOMaskImage,
    setVTOGeneratedImages,
    setVTOSelectedImageIndex,
    setVTOParameters,
    setVTOLoadingState,
  } = useAppStore();

  const handleModelImageUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    setVTOModelImage(file, url);
  };

  const handleMaskSave = (file: File) => {
    const url = URL.createObjectURL(file);
    setVTOMaskImage(file, url);
    // Also set mask type to IMAGE when mask is created from paint
    setVTOParameters({ maskType: 'IMAGE' });
  };

  const handleGarmentImageUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    setVTOGarmentImage(file, url);
  };

  const handleMaskImageUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    setVTOMaskImage(file, url);
  };

  // S3からの画像ポーリング（複数画像対応版）
  const pollForGeneratedImages = useCallback(async (objectNames: string[], maxAttempts = 100) => {
    try {
      const presignedUrlPromises = objectNames.map(objName => 
        getPresignedDownloadUrl(objName, 1800)
      );
      
      const presignedUrlResponses = await Promise.all(presignedUrlPromises);
      const presignedUrls = presignedUrlResponses.map(res => res.url).filter(Boolean);
      
      if (presignedUrls.length === 0) {
        setVTOLoadingState({ error: 'Failed to obtain presigned URL.', isLoading: false, downloadProgress: false });
        return;
      }

      const pollWithUrls = async (attemptCount: number) => {
        if (attemptCount >= maxAttempts) {
          setVTOLoadingState({ error: 'Image generation failed. Please try again.', isLoading: false, downloadProgress: false });
          return;
        }

        try {
          const imageDataUrlPromises = presignedUrls.map(url => downloadImageFromS3(url));
          const imageDataUrls = await Promise.all(imageDataUrlPromises);
          
          // Convert string[] to the expected format
          const imageObjects = imageDataUrls.map(url => ({
            base64: url.split(',')[1], // Remove data:image/png;base64, prefix
            error: false,
            errorMessage: undefined
          }));
          
          setVTOGeneratedImages(imageObjects);
          setVTOLoadingState({ isLoading: false, downloadProgress: false });
          return;
        } catch (downloadErr) {
          setTimeout(() => {
            pollWithUrls(attemptCount + 1);
          }, 3000); 
        }
      };

      pollWithUrls(0);

    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Error occurred during polling setup.';
      setVTOLoadingState({ error: `Error: ${errorMessage}`, isLoading: false, downloadProgress: false });
    }
  }, [setVTOGeneratedImages, setVTOLoadingState]);

  // VTO生成処理
  const handleGenerate = async () => {
    if (!modelImageFile || !garmentImageFile) {
      setVTOLoadingState({ error: 'Please upload both model image and garment image.' });
      return;
    }

    setVTOLoadingState({ isLoading: true, error: null });
    setVTOGeneratedImages([]);
    
    try {
      setVTOLoadingState({ uploadProgress: true });
      
      if (!user?.username) {
        setVTOLoadingState({ error: 'Unable to get user information. Please log in again.', isLoading: false });
        return;
      }
      
      const groupId = 'vto-group';
      const userId = user.username;
      const objectNamesResponse = await generateObjectNames(groupId, userId);
      const { date_folder, timestamp, uid } = objectNamesResponse;
      
      const sourceImageObjName = `${groupId}/${userId}/vto/${date_folder}/${uid}/source_image.png`;
      const referenceImageObjName = `${groupId}/${userId}/vto/${date_folder}/${uid}/reference_image.png`;
      const maskImageObjName = maskImageFile ? `${groupId}/${userId}/vto/${date_folder}/${uid}/mask_image.png` : undefined;
      
      // バリデーション用のリクエストオブジェクトを作成
      const requestData = {
        group_id: groupId,
        user_id: userId,
        source_image_object_name: sourceImageObjName,
        reference_image_object_name: referenceImageObjName,
        mask_image_object_name: maskImageObjName,
        mask_type: maskType,
        mask_prompt: maskPrompt,
        garment_class: garmentClass,
        long_sleeve_style: longSleeveStyle || undefined,
        tucking_style: tuckingStyle || undefined,
        outer_layer_style: outerLayerStyle || undefined,
        mask_shape: maskShape,
        mask_shape_prompt: maskShapePrompt,
        preserve_body_pose: preserveBodyPose,
        preserve_hands: preserveHands,
        preserve_face: preserveFace,
        merge_style: mergeStyle || undefined,
        return_mask: returnMask,
        number_of_images: numberOfImages,
        quality: quality as 'standard' | 'premium',
        cfg_scale: cfgScale,
        seed: seed,
      };
      
      // バリデーションを実行
      const validationResult = validateNovaVTORequest(requestData);
      if (!validationResult.success) {
        const errors = getValidationErrors(validationResult.error!);
        const errorMessages = Object.entries(errors).map(([field, message]) => `${field}: ${message}`).join('\n');
        setVTOLoadingState({ error: `Validation Error:\n${errorMessages}`, isLoading: false, uploadProgress: false });
        return;
      }
      
      const generatedObjectNames = [];
      for (let i = 0; i < numberOfImages; i++) {
        generatedObjectNames.push(`${groupId}/${userId}/vto/${date_folder}/${uid}/result_${i}.png`);
      }
      
      const sourceUploadUrlResponse = await getPresignedUploadUrl(sourceImageObjName);
      const referenceUploadUrlResponse = await getPresignedUploadUrl(referenceImageObjName);
      
      if (!sourceUploadUrlResponse.url || !referenceUploadUrlResponse.url) {
        throw new Error('Failed to obtain presigned URL.');
      }
      
      const sourceUploadSuccess = await uploadFileToS3(modelImageFile, sourceUploadUrlResponse.url);
      const referenceUploadSuccess = await uploadFileToS3(garmentImageFile, referenceUploadUrlResponse.url);
      
      // マスク画像がある場合はアップロード
      let maskUploadSuccess = true;
      if (maskImageFile && maskImageObjName) {
        const maskUploadUrlResponse = await getPresignedUploadUrl(maskImageObjName);
        if (!maskUploadUrlResponse.url) {
          throw new Error('Failed to obtain presigned URL for mask image.');
        }
        maskUploadSuccess = await uploadFileToS3(maskImageFile, maskUploadUrlResponse.url);
      }
      
      if (!sourceUploadSuccess || !referenceUploadSuccess || !maskUploadSuccess) {
        throw new Error('Image upload failed.');
      }
      
      setVTOLoadingState({ uploadProgress: false, processingProgress: true });
      
      const vtoResponse = await processNovaVTO({
        groupId,
        userId,
        dateFolder: date_folder,
        timestamp,
        uid,
        objectNames: generatedObjectNames,
        sourceImageObjectName: sourceImageObjName,
        referenceImageObjectName: referenceImageObjName,
        maskImageObjectName: maskImageObjName,
        maskType,
        maskPrompt,
        garmentClass,
        longSleeveStyle,
        tuckingStyle,
        outerLayerStyle,
        maskShape,
        maskShapePrompt,
        preserveBodyPose,
        preserveHands,
        preserveFace,
        mergeStyle,
        returnMask,
        numberOfImages,
        quality,
        cfgScale,
        seed,
      });
      
      setVTOLoadingState({ processingProgress: false, downloadProgress: true });
      
      if (vtoResponse.status === 'accepted' && vtoResponse.object_names && vtoResponse.object_names.length > 0) {
        pollForGeneratedImages(vtoResponse.object_names);
      } else {
        setVTOLoadingState({ error: 'VTO processing request failed.', isLoading: false, downloadProgress: false });
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error occurred during VTO processing.';
      setVTOLoadingState({ 
        error: `Error: ${errorMessage}`, 
        isLoading: false, 
        uploadProgress: false, 
        processingProgress: false, 
        downloadProgress: false 
      });
    }
  };

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('virtualTryOn.title')}
      </Typography>
      
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3} sx={{ mb: 4, mt: 3 }}>
        {/* Left Side - Image Uploads and Parameters (1/3) */}
        <Box sx={{ flex: { xs: 1, lg: 1 }, maxWidth: { lg: '33%' } }}>
          {/* Model Image Upload Accordion */}
          <Accordion defaultExpanded sx={{ mb: 2 }}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="model-image-content"
              id="model-image-header"
            >
              <Typography variant="h6">{t('virtualTryOn.modelImage')}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <ImageUpload
                label={t('virtualTryOn.modelImage')}
                onImageUpload={handleModelImageUpload}
                uploadedImage={modelImage}
                allowMask={true}
              />
            </AccordionDetails>
          </Accordion>

          {/* Garment Image Upload Accordion */}
          <Accordion defaultExpanded sx={{ mb: 2 }}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="garment-image-content"
              id="garment-image-header"
            >
              <Typography variant="h6">{t('virtualTryOn.garmentImage')}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <ImageUpload
                label={t('virtualTryOn.garmentImage')}
                onImageUpload={handleGarmentImageUpload}
                uploadedImage={garmentImage}
              />
            </AccordionDetails>
          </Accordion>

          {/* VTO Parameters */}
          <Accordion defaultExpanded sx={{ mb: 2 }}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="vto-parameters-content"
              id="vto-parameters-header"
            >
              <Typography variant="h6">{t('virtualTryOn.vtoParameters')}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                {/* Mask Parameters */}
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>{t('virtualTryOn.maskParameters')}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <FormControl fullWidth>
                        <InputLabel>{t('virtualTryOn.maskType')}</InputLabel>
                        <Select
                          value={maskType}
                          onChange={(e) => setVTOParameters({ maskType: e.target.value })}
                          label={t('virtualTryOn.maskType')}
                        >
                          <MenuItem value="GARMENT">{t('virtualTryOn.maskTypeGarment')}</MenuItem>
                          <MenuItem value="PROMPT">{t('virtualTryOn.maskTypePrompt')}</MenuItem>
                          <MenuItem value="IMAGE">{t('virtualTryOn.maskTypeImage')}</MenuItem>
                        </Select>
                      </FormControl>

                      <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>{t('virtualTryOn.mergeStyle')}</InputLabel>
                        <Select
                          value={mergeStyle}
                          onChange={(e) => setVTOParameters({ mergeStyle: e.target.value })}
                          label="Merge Style"
                        >
                          <MenuItem value="BALANCED">{t('virtualTryOn.balanced')}</MenuItem>
                          <MenuItem value="SEAMLESS">{t('virtualTryOn.seamless')}</MenuItem>
                          <MenuItem value="DETAILED">{t('virtualTryOn.detailed')}</MenuItem>
                        </Select>
                      </FormControl>

                      {maskType === 'PROMPT' && (
                        <Box>
                          <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                            *{t('virtualTryOn.maskPromptDescription')}*
                          </Typography>
                          <TextField
                            fullWidth
                            label={t('virtualTryOn.maskPrompt')}
                            placeholder="e.g., 'upper body clothing', 'shirt and jacket', 'dress'"
                            value={maskPrompt}
                            onChange={(e) => setVTOParameters({ maskPrompt: e.target.value })}
                          />
                        </Box>
                      )}

                      {maskType === 'IMAGE' && (
                        <Box>
                          <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                            *{t('virtualTryOn.maskImageDescription')}*
                          </Typography>
                          <Box sx={{ position: 'relative' }}>
                            <ImageUpload
                              label={t('virtualTryOn.maskPrompt')}
                              onImageUpload={handleMaskImageUpload}
                              uploadedImage={maskImage}
                              height={200}
                            />
                            {maskImage && (
                              <IconButton
                                onClick={() => {
                                  setVTOMaskImage(null, null);
                                }}
                                sx={{
                                  position: 'absolute',
                                  top: 8,
                                  right: 8,
                                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                  '&:hover': {
                                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                  },
                                  zIndex: 10,
                                }}
                                size="small"
                              >
                                <ClearIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Box>
                          <MaskCreator
                            sourceImage={modelImage}
                            onMaskSave={handleMaskSave}
                            fullWidth
                            buttonText={t('virtualTryOn.createMaskImage')}
                            buttonVariant="outlined"
                          />
                        </Box>
                      )}

                      {/* PROMPT Mask Type Parameters */}
                      {maskType === 'PROMPT' && (
                        <Accordion>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="subtitle2">{t('virtualTryOn.promptMaskTypeParams')}</Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <FormControl component="fieldset">
                              <FormLabel component="legend">{t('virtualTryOn.maskShapePrompt')}</FormLabel>
                              <RadioGroup
                                value={maskShapePrompt}
                                onChange={(e) => setVTOParameters({ maskShapePrompt: e.target.value })}
                              >
                                <FormControlLabel value="DEFAULT" control={<Radio />} label={t('virtualTryOn.default')} />
                                <FormControlLabel value="CONTOUR" control={<Radio />} label={t('virtualTryOn.contour')} />
                                <FormControlLabel value="BOUNDING_BOX" control={<Radio />} label={t('virtualTryOn.boundingBox')} />
                              </RadioGroup>
                            </FormControl>
                          </AccordionDetails>
                        </Accordion>
                      )}

                      {/* Garment Mask Type Parameters */}
                      {maskType === 'GARMENT' && (
                        <Accordion>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="subtitle2">{t('virtualTryOn.garmentMaskTypeParams')}</Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                              *{t('virtualTryOn.garmentClassDescription')}*
                            </Typography>

                            <FormControl fullWidth sx={{ mb: 2 }}>
                              <InputLabel>{t('virtualTryOn.garmentClass')}</InputLabel>
                              <Select
                                value={garmentClass}
                                onChange={(e) => setVTOParameters({ garmentClass: e.target.value })}
                              >
                                <MenuItem value="UPPER_BODY">{t('virtualTryOn.upperBody')}</MenuItem>
                                <MenuItem value="LOWER_BODY">{t('virtualTryOn.lowerBody')}</MenuItem>
                                <MenuItem value="FULL_BODY">{t('virtualTryOn.fullBody')}</MenuItem>
                                <MenuItem value="SHOES">{t('virtualTryOn.shoes')}</MenuItem>
                              </Select>
                            </FormControl>

                            <Typography variant="h6" gutterBottom>
                              {t('virtualTryOn.garmentStyling')}
                            </Typography>
                            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                              *{t('virtualTryOn.garmentStylingDesc')}*
                            </Typography>

                            {(garmentClass === 'UPPER_BODY' || garmentClass === 'FULL_BODY') && (
                              <>
                                <FormControl fullWidth sx={{ mb: 2 }}>
                                  <InputLabel>{t('virtualTryOn.longSleeveStyle')}</InputLabel>
                                  <Select
                                    value={longSleeveStyle}
                                    onChange={(e) => setVTOParameters({ longSleeveStyle: e.target.value })}
                                    label="Long Sleeve Style"
                                  >
                                    <MenuItem value="">{t('virtualTryOn.none')}</MenuItem>
                                    <MenuItem value="SLEEVE_DOWN">{t('virtualTryOn.sleeveDown')}</MenuItem>
                                    <MenuItem value="SLEEVE_UP">{t('virtualTryOn.sleeveUp')}</MenuItem>
                                  </Select>
                                </FormControl>

                                <FormControl fullWidth sx={{ mb: 2 }}>
                                  <InputLabel>{t('virtualTryOn.tuckingStyle')}</InputLabel>
                                  <Select
                                    value={tuckingStyle}
                                    onChange={(e) => setVTOParameters({ tuckingStyle: e.target.value })}
                                    label="Tucking Style"
                                  >
                                    <MenuItem value="">{t('virtualTryOn.none')}</MenuItem>
                                    <MenuItem value="UNTUCKED">{t('virtualTryOn.untucked')}</MenuItem>
                                    <MenuItem value="TUCKED">{t('virtualTryOn.tucked')}</MenuItem>
                                  </Select>
                                </FormControl>

                                <FormControl fullWidth sx={{ mb: 2 }}>
                                  <InputLabel>{t('virtualTryOn.outerLayerStyle')}</InputLabel>
                                  <Select
                                    value={outerLayerStyle}
                                    onChange={(e) => setVTOParameters({ outerLayerStyle: e.target.value })}
                                    label="Outer Layer Style"
                                  >
                                    <MenuItem value="">{t('virtualTryOn.none')}</MenuItem>
                                    <MenuItem value="CLOSED">{t('virtualTryOn.closed')}</MenuItem>
                                    <MenuItem value="OPEN">{t('virtualTryOn.open')}</MenuItem>
                                  </Select>
                                </FormControl>
                              </>
                            )}

                            <FormControl fullWidth>
                              <InputLabel>{t('virtualTryOn.maskShapeGarment')}</InputLabel>
                              <Select
                                value={maskShape}
                                onChange={(e) => setVTOParameters({ maskShape: e.target.value })}
                                label="Mask Shape for Garment"
                              >
                                <MenuItem value="DEFAULT">{t('virtualTryOn.default')}</MenuItem>
                                <MenuItem value="CONTOUR">{t('virtualTryOn.contour')}</MenuItem>
                                <MenuItem value="BOUNDING_BOX">{t('virtualTryOn.boundingBox')}</MenuItem>
                              </Select>
                            </FormControl>
                          </AccordionDetails>
                        </Accordion>
                      )}

                      {/* IMAGE Mask Type Parameters */}
                      {maskType === 'IMAGE' && (
                        <Accordion>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="subtitle2">{t('virtualTryOn.imageMaskTypeParams')}</Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <FormControl component="fieldset" sx={{ mb: 2 }}>
                                <FormLabel component="legend">{t('virtualTryOn.preserveBodyPose')}</FormLabel>
                                <RadioGroup
                                  row
                                  value={preserveBodyPose}
                                  onChange={(e) => setVTOParameters({ preserveBodyPose: e.target.value })}
                                >
                                  <FormControlLabel value="ON" control={<Radio />} label={t('virtualTryOn.on')} />
                                  <FormControlLabel value="OFF" control={<Radio />} label={t('virtualTryOn.off')} />
                                </RadioGroup>
                              </FormControl>

                              <FormControl component="fieldset" sx={{ mb: 2 }}>
                                <FormLabel component="legend">{t('virtualTryOn.preserveHands')}</FormLabel>
                                <RadioGroup
                                  row
                                  value={preserveHands}
                                  onChange={(e) => setVTOParameters({ preserveHands: e.target.value })}
                                >
                                  <FormControlLabel value="ON" control={<Radio />} label={t('virtualTryOn.on')} />
                                  <FormControlLabel value="OFF" control={<Radio />} label={t('virtualTryOn.off')} />
                                </RadioGroup>
                              </FormControl>

                              <FormControl component="fieldset" sx={{ mb: 2 }}>
                                <FormLabel component="legend">{t('virtualTryOn.preserveFace')}</FormLabel>
                                <RadioGroup
                                  row
                                  value={preserveFace}
                                  onChange={(e) => setVTOParameters({ preserveFace: e.target.value })}
                                >
                                  <FormControlLabel value="ON" control={<Radio />} label={t('virtualTryOn.on')} />
                                  <FormControlLabel value="OFF" control={<Radio />} label={t('virtualTryOn.off')} />
                                </RadioGroup>
                              </FormControl>
                            </Box>
                          </AccordionDetails>
                        </Accordion>
                      )}
                    </Box>
                  </AccordionDetails>
                </Accordion>

                {/* Image Generation Parameters */}
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>{t('virtualTryOn.imageGenerationParams')}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <TextField
                      fullWidth
                      type="number"
                      label={t('virtualTryOn.numberOfImages')}
                      value={numberOfImages}
                      onChange={(e) => setVTOParameters({ numberOfImages: Number(e.target.value) })}
                      inputProps={{ min: 1, max: 5, step: 1 }}
                      sx={{ mb: 2 }}
                    />

                    <FormControl component="fieldset" sx={{ mb: 2 }}>
                      <FormLabel component="legend">{t('virtualTryOn.quality')}</FormLabel>
                      <RadioGroup
                        value={quality}
                        onChange={(e) => setVTOParameters({ quality: e.target.value })}
                      >
                        <FormControlLabel value="standard" control={<Radio />} label={t('virtualTryOn.standard')} />
                        <FormControlLabel value="premium" control={<Radio />} label={t('virtualTryOn.premium')} />
                      </RadioGroup>
                    </FormControl>

                    <Box sx={{ mb: 2 }}>
                      <Typography gutterBottom>{t('virtualTryOn.cfgScale')}</Typography>
                      <Slider
                        value={cfgScale}
                        onChange={(_, value) => setVTOParameters({ cfgScale: value as number })}
                        min={1.1}
                        max={10}
                        step={0.1}
                        valueLabelDisplay="auto"
                      />
                    </Box>

                    <TextField
                      fullWidth
                      type="number"
                      label={t('virtualTryOn.seed')}
                      value={seed}
                      onChange={(e) => setVTOParameters({ seed: Number(e.target.value) })}
                      inputProps={{ min: -1, max: 2147483647, step: 1 }}
                    />
                  </AccordionDetails>
                </Accordion>
              </Stack>
            </AccordionDetails>
          </Accordion>

          {/* Generate Button */}
          <Button
            variant="contained"
            color="primary"
            fullWidth
            sx={{ mb: 2 }}
            onClick={handleGenerate}
            disabled={isLoading || !modelImage || !garmentImage}
          >
            {isLoading ? t('virtualTryOn.generating') : t('virtualTryOn.generate')}
          </Button>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setVTOLoadingState({ error: null })}>
              {error.split('\n').map((line, index) => (
                <Typography key={index} variant="body2">
                  {line}
                </Typography>
              ))}
            </Alert>
          )}
        </Box>

        {/* Right Side - Generated Images (2/3) */}
        <ImageDisplay
          images={generatedImages}
          selectedImageIndex={selectedImageIndex}
          onSelectImage={setVTOSelectedImageIndex}
          loading={isLoading}
          title={t('virtualTryOn.generatedImages')}
          emptyMessage={t('virtualTryOn.emptyMessage')}
          loadingMessage={
            uploadProgress ? t('virtualTryOn.uploadingImages') : 
            processingProgress ? t('virtualTryOn.processingVTO') : 
            downloadProgress ? t('virtualTryOn.retrievingImages') : t('virtualTryOn.generating')
          }
          downloadFileName={`vto-result-${selectedImageIndex + 1}.png`}
        />
      </Stack>

    </>
  );
};

export default VirtualTryOn;
