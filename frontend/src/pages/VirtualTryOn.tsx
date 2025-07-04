import React, { useCallback } from 'react';
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
        Virtual Try-On
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
              <Typography variant="h6">Model Image</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <ImageUpload
                label="Model Image"
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
              <Typography variant="h6">Garment Image</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <ImageUpload
                label="Garment Image"
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
              <Typography variant="h6">VTO Parameters</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                {/* Mask Parameters */}
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>Mask Parameters</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <FormControl fullWidth>
                        <InputLabel>Mask Type</InputLabel>
                        <Select
                          value={maskType}
                          onChange={(e) => setVTOParameters({ maskType: e.target.value })}
                          label="Mask Type"
                        >
                          <MenuItem value="GARMENT">Garment</MenuItem>
                          <MenuItem value="PROMPT">Prompt</MenuItem>
                          <MenuItem value="IMAGE">Image</MenuItem>
                        </Select>
                      </FormControl>

                      {maskType === 'PROMPT' && (
                        <Box>
                          <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                            *Use text prompts to define the mask area*
                          </Typography>
                          <TextField
                            fullWidth
                            label="Mask Prompt"
                            placeholder="e.g., 'upper body clothing', 'shirt and jacket', 'dress'"
                            value={maskPrompt}
                            onChange={(e) => setVTOParameters({ maskPrompt: e.target.value })}
                          />
                        </Box>
                      )}

                      {maskType === 'IMAGE' && (
                        <Box>
                          <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                            *Upload a mask image to define the area to be replaced*
                          </Typography>
                          <Box sx={{ position: 'relative' }}>
                            <ImageUpload
                              label="Mask Image"
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
                            buttonText="Create Mask Image"
                            buttonVariant="outlined"
                          />
                        </Box>
                      )}

                      {/* PROMPT Mask Type Parameters */}
                      {maskType === 'PROMPT' && (
                        <Accordion>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="subtitle2">PROMPT Mask Type Parameters</Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <FormControl component="fieldset">
                              <FormLabel component="legend">Mask Shape for Prompt (optional)</FormLabel>
                              <RadioGroup
                                value={maskShapePrompt}
                                onChange={(e) => setVTOParameters({ maskShapePrompt: e.target.value })}
                              >
                                <FormControlLabel value="DEFAULT" control={<Radio />} label="Default" />
                                <FormControlLabel value="CONTOUR" control={<Radio />} label="Contour" />
                                <FormControlLabel value="BOUNDING_BOX" control={<Radio />} label="Bounding Box" />
                              </RadioGroup>
                            </FormControl>
                          </AccordionDetails>
                        </Accordion>
                      )}

                      {/* Garment Mask Type Parameters */}
                      {maskType === 'GARMENT' && (
                        <Accordion>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="subtitle2">Garment Mask Type Parameters</Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                              *These are used when mask type is GARMENT and no mask prompt is provided*
                            </Typography>

                            <FormControl fullWidth sx={{ mb: 2 }}>
                              <InputLabel>Garment Class</InputLabel>
                              <Select
                                value={garmentClass}
                                onChange={(e) => setVTOParameters({ garmentClass: e.target.value })}
                              >
                                <MenuItem value="UPPER_BODY">Upper Body</MenuItem>
                                <MenuItem value="LOWER_BODY">Lower Body</MenuItem>
                                <MenuItem value="FULL_BODY">Full Body</MenuItem>
                                <MenuItem value="FOOTWEAR">Footwear</MenuItem>
                                <MenuItem value="LONG_SLEEVE_SHIRT">Long Sleeve Shirt</MenuItem>
                                <MenuItem value="SHORT_SLEEVE_SHIRT">Short Sleeve Shirt</MenuItem>
                                <MenuItem value="NO_SLEEVE_SHIRT">No Sleeve Shirt</MenuItem>
                                <MenuItem value="OTHER_UPPER_BODY">Other Upper Body</MenuItem>
                                <MenuItem value="LONG_PANTS">Long Pants</MenuItem>
                                <MenuItem value="SHORT_PANTS">Short Pants</MenuItem>
                                <MenuItem value="OTHER_LOWER_BODY">Other Lower Body</MenuItem>
                                <MenuItem value="LONG_DRESS">Long Dress</MenuItem>
                                <MenuItem value="SHORT_DRESS">Short Dress</MenuItem>
                                <MenuItem value="FULL_BODY_OUTFIT">Full Body Outfit</MenuItem>
                                <MenuItem value="OTHER_FULL_BODY">Other Full Body</MenuItem>
                                <MenuItem value="SHOES">Shoes</MenuItem>
                                <MenuItem value="BOOTS">Boots</MenuItem>
                                <MenuItem value="OTHER_FOOTWEAR">Other Footwear</MenuItem>
                              </Select>
                            </FormControl>

                            <Typography variant="h6" gutterBottom>
                              Optional Parameters - Garment Styling
                            </Typography>
                            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                              *Leave unselected to use default values*
                            </Typography>

                            <FormControl fullWidth sx={{ mb: 2 }}>
                              <InputLabel>Long Sleeve Style</InputLabel>
                              <Select
                                value={longSleeveStyle}
                                onChange={(e) => setVTOParameters({ longSleeveStyle: e.target.value })}
                                label="Long Sleeve Style"
                              >
                                <MenuItem value="">None</MenuItem>
                                <MenuItem value="SLEEVE_DOWN">Sleeve Down</MenuItem>
                                <MenuItem value="SLEEVE_UP">Sleeve Up</MenuItem>
                              </Select>
                            </FormControl>

                            <FormControl fullWidth sx={{ mb: 2 }}>
                              <InputLabel>Tucking Style</InputLabel>
                              <Select
                                value={tuckingStyle}
                                onChange={(e) => setVTOParameters({ tuckingStyle: e.target.value })}
                                label="Tucking Style"
                              >
                                <MenuItem value="">None</MenuItem>
                                <MenuItem value="UNTUCKED">Untucked</MenuItem>
                                <MenuItem value="TUCKED">Tucked</MenuItem>
                              </Select>
                            </FormControl>

                            <FormControl fullWidth sx={{ mb: 2 }}>
                              <InputLabel>Outer Layer Style</InputLabel>
                              <Select
                                value={outerLayerStyle}
                                onChange={(e) => setVTOParameters({ outerLayerStyle: e.target.value })}
                                label="Outer Layer Style"
                              >
                                <MenuItem value="">None</MenuItem>
                                <MenuItem value="CLOSED">Closed</MenuItem>
                                <MenuItem value="OPEN">Open</MenuItem>
                              </Select>
                            </FormControl>

                            <FormControl fullWidth>
                              <InputLabel>Mask Shape for Garment</InputLabel>
                              <Select
                                value={maskShape}
                                onChange={(e) => setVTOParameters({ maskShape: e.target.value })}
                                label="Mask Shape for Garment"
                              >
                                <MenuItem value="DEFAULT">Default</MenuItem>
                                <MenuItem value="CONTOUR">Contour</MenuItem>
                                <MenuItem value="BOUNDING_BOX">Bounding Box</MenuItem>
                              </Select>
                            </FormControl>
                          </AccordionDetails>
                        </Accordion>
                      )}

                      {/* IMAGE Mask Type Parameters */}
                      {maskType === 'IMAGE' && (
                        <Accordion>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="subtitle2">IMAGE Mask Type Parameters</Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <FormControl component="fieldset" sx={{ mb: 2 }}>
                                <FormLabel component="legend">Preserve Body Pose</FormLabel>
                                <RadioGroup
                                  row
                                  value={preserveBodyPose}
                                  onChange={(e) => setVTOParameters({ preserveBodyPose: e.target.value })}
                                >
                                  <FormControlLabel value="ON" control={<Radio />} label="On" />
                                  <FormControlLabel value="OFF" control={<Radio />} label="Off" />
                                </RadioGroup>
                              </FormControl>

                              <FormControl component="fieldset" sx={{ mb: 2 }}>
                                <FormLabel component="legend">Preserve Hands</FormLabel>
                                <RadioGroup
                                  row
                                  value={preserveHands}
                                  onChange={(e) => setVTOParameters({ preserveHands: e.target.value })}
                                >
                                  <FormControlLabel value="ON" control={<Radio />} label="On" />
                                  <FormControlLabel value="OFF" control={<Radio />} label="Off" />
                                </RadioGroup>
                              </FormControl>

                              <FormControl component="fieldset" sx={{ mb: 2 }}>
                                <FormLabel component="legend">Preserve Face</FormLabel>
                                <RadioGroup
                                  row
                                  value={preserveFace}
                                  onChange={(e) => setVTOParameters({ preserveFace: e.target.value })}
                                >
                                  <FormControlLabel value="ON" control={<Radio />} label="On" />
                                  <FormControlLabel value="OFF" control={<Radio />} label="Off" />
                                </RadioGroup>
                              </FormControl>

                              <FormControl fullWidth sx={{ mb: 2 }}>
                                <InputLabel>Merge Style</InputLabel>
                                <Select
                                  value={mergeStyle}
                                  onChange={(e) => setVTOParameters({ mergeStyle: e.target.value })}
                                  label="Merge Style"
                                >
                                  <MenuItem value="BALANCED">Balanced</MenuItem>
                                  <MenuItem value="SEAMLESS">Seamless</MenuItem>
                                  <MenuItem value="DETAILED">Detailed</MenuItem>
                                </Select>
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
                    <Typography>Image Generation Parameters</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <FormGroup sx={{ mb: 2 }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={returnMask}
                            onChange={(e) => setVTOParameters({ returnMask: e.target.checked })}
                          />
                        }
                        label="Return Mask"
                      />
                    </FormGroup>

                    <TextField
                      fullWidth
                      type="number"
                      label="Number of Images (default: 1)"
                      value={numberOfImages}
                      onChange={(e) => setVTOParameters({ numberOfImages: Number(e.target.value) })}
                      inputProps={{ min: 1, max: 5, step: 1 }}
                      sx={{ mb: 2 }}
                    />

                    <FormControl component="fieldset" sx={{ mb: 2 }}>
                      <FormLabel component="legend">Quality (default: standard)</FormLabel>
                      <RadioGroup
                        value={quality}
                        onChange={(e) => setVTOParameters({ quality: e.target.value })}
                      >
                        <FormControlLabel value="standard" control={<Radio />} label="Standard" />
                        <FormControlLabel value="premium" control={<Radio />} label="Premium" />
                      </RadioGroup>
                    </FormControl>

                    <Box sx={{ mb: 2 }}>
                      <Typography gutterBottom>CFG Scale (default: 3.0)</Typography>
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
                      label="Seed (-1 for random)"
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
            {isLoading ? 'Generating...' : 'Generate Try-On'}
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
          title="Generated Images"
          emptyMessage="Try-on result will appear here"
          loadingMessage={
            uploadProgress ? 'Uploading images...' : 
            processingProgress ? 'Processing VTO request...' : 
            downloadProgress ? 'Retrieving generated images...' : 'Generating images...'
          }
          downloadFileName={`vto-result-${selectedImageIndex + 1}.png`}
        />
      </Stack>

    </>
  );
};

export default VirtualTryOn;
