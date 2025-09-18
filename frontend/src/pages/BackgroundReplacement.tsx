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
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Slider,
  Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ImageUpload from '../components/ImageUpload';
import ImageDisplay from '../components/ImageDisplay';
import ImageSizeSelector from '../components/ImageSizeSelector';
import {
  generateObjectNames,
  getPresignedUploadUrl,
  uploadFileToS3,
  getPresignedDownloadUrl,
  downloadImageFromS3,
  processBackgroundReplacement,
} from '../hooks/api';
import { validateBackgroundReplacementRequest, getValidationErrors } from '../utils/validation';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../stores/appStore';

const BackgroundReplacement: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  
  // Zustand Store
  const {
    backgroundReplacement: {
      sourceImageFile,
      sourceImage,
      generatedImages,
      selectedImageIndex,
      parameters: {
        prompt,
        maskPrompt,
        modelId,
        outPaintingMode,
        cfgScale,
        numberOfImages,
        height,
        width,
      },
      isLoading,
      uploadProgress,
      processingProgress,
      downloadProgress,
      error,
    },
    setBackgroundSourceImage,
    setBackgroundGeneratedImages,
    setBackgroundSelectedImageIndex,
    setBackgroundParameters,
    setBackgroundLoadingState,
  } = useAppStore();


  const handleSourceImageUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    setBackgroundSourceImage(file, url);
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
        setBackgroundLoadingState({ error: 'Failed to obtain presigned URL.', isLoading: false, downloadProgress: false });
        return;
      }

      const pollWithUrls = async (attemptCount: number) => {
        if (attemptCount >= maxAttempts) {
          setBackgroundLoadingState({ error: 'Image generation failed. Please try again.', isLoading: false, downloadProgress: false });
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
          
          setBackgroundGeneratedImages(imageObjects);
          setBackgroundLoadingState({ isLoading: false, downloadProgress: false });
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
      setBackgroundLoadingState({ error: `Error: ${errorMessage}`, isLoading: false, downloadProgress: false });
    }
  }, [setBackgroundGeneratedImages, setBackgroundLoadingState]);

  // 背景変更生成処理
  const handleGenerate = async () => {
    if (!sourceImageFile) {
      setBackgroundLoadingState({ error: 'Please upload source image.' });
      return;
    }

    if (!prompt.trim()) {
      setBackgroundLoadingState({ error: 'Please enter background description prompt.' });
      return;
    }

    setBackgroundLoadingState({ isLoading: true, error: null });
    setBackgroundGeneratedImages([]);
    
    try {
      setBackgroundLoadingState({ uploadProgress: true });
      
      if (!user?.username) {
        setBackgroundLoadingState({ error: 'Unable to get user information. Please log in again.', isLoading: false });
        return;
      }
      
      const groupId = 'background-group';
      const userId = user.username;
      const objectNamesResponse = await generateObjectNames(groupId, userId);
      const { date_folder, timestamp, uid } = objectNamesResponse;
      
      const inputImageObjectName = `${groupId}/${userId}/background_replace/${date_folder}/${uid}/source_image.png`;
      
      // バリデーション用のリクエストオブジェクトを作成
      const requestData = {
        group_id: groupId,
        user_id: userId,
        prompt: prompt,
        input_image_object_name: inputImageObjectName,
        mask_prompt: maskPrompt,
        mask_image_object_name: undefined,
        model_id: modelId,
        outPaintingMode: outPaintingMode,
        cfg_scale: cfgScale,
        number_of_images: numberOfImages,
        height: height,
        width: width,
      };
      
      // バリデーションを実行
      const validationResult = validateBackgroundReplacementRequest(requestData);
      if (!validationResult.success) {
        const errors = getValidationErrors(validationResult.error!);
        const errorMessages = Object.entries(errors).map(([field, message]) => `${field}: ${message}`).join('\n');
        setBackgroundLoadingState({ error: `Validation Error:\n${errorMessages}`, isLoading: false, uploadProgress: false });
        return;
      }
      
      const generatedObjectNames = [];
      for (let i = 0; i < numberOfImages; i++) {
        generatedObjectNames.push(`${groupId}/${userId}/background_replace/${date_folder}/${uid}/result_${i}.png`);
      }
      
      const sourceUploadUrlResponse = await getPresignedUploadUrl(inputImageObjectName);
      
      if (!sourceUploadUrlResponse.url) {
        throw new Error('Failed to obtain presigned URL.');
      }
      
      const sourceUploadSuccess = await uploadFileToS3(sourceImageFile, sourceUploadUrlResponse.url);
      
      if (!sourceUploadSuccess) {
        throw new Error('Image upload failed.');
      }
      
      setBackgroundLoadingState({ uploadProgress: false, processingProgress: true });
      
      const backgroundResponse = await processBackgroundReplacement({
        groupId,
        userId,
        dateFolder: date_folder,
        timestamp,
        uid,
        objectNames: generatedObjectNames,
        prompt,
        inputImageObjectName,
        maskPrompt,
        maskImageObjectName: undefined,
        modelId,
        outPaintingMode,
        cfgScale,
        numberOfImages,
        height,
        width,
      });
      
      setBackgroundLoadingState({ processingProgress: false, downloadProgress: true });
      
      if (backgroundResponse.status === 'accepted' && backgroundResponse.object_names && backgroundResponse.object_names.length > 0) {
        pollForGeneratedImages(backgroundResponse.object_names);
      } else {
        setBackgroundLoadingState({ error: 'Background replacement processing request failed.', isLoading: false, downloadProgress: false });
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error occurred during background replacement processing.';
      setBackgroundLoadingState({ 
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
        {t('backgroundReplacement.title')}
      </Typography>
      
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3} sx={{ mb: 4, mt: 3 }}>
        {/* Left Side - Image Uploads and Parameters (1/3) */}
        <Box sx={{ flex: { xs: 1, lg: 1 }, maxWidth: { lg: '33%' } }}>
          {/* Source Image Upload Accordion */}
          <Accordion defaultExpanded sx={{ mb: 2 }}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="source-image-content"
              id="source-image-header"
            >
              <Typography variant="h6">{t('backgroundReplacement.sourceImage')}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <ImageUpload
                label={t('backgroundReplacement.sourceImage')}
                onImageUpload={handleSourceImageUpload}
                uploadedImage={sourceImage}
              />
            </AccordionDetails>
          </Accordion>

          {/* Background Replacement Parameters */}
          <Accordion defaultExpanded sx={{ mb: 2 }}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="background-parameters-content"
              id="background-parameters-header"
            >
              <Typography variant="h6">{t('backgroundReplacement.backgroundParameters')}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                {/* Background Prompt */}
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label={t('backgroundReplacement.backgroundPrompt')}
                  placeholder={t('backgroundReplacement.backgroundPromptPlaceholder')}
                  value={prompt}
                  onChange={(e) => setBackgroundParameters({ prompt: e.target.value })}
                  helperText={t('backgroundReplacement.backgroundPromptHelp')}
                  inputProps={{ maxLength: 1024 }}
                />

                {/* Mask Image */}
                <TextField
                  fullWidth
                  label={t('backgroundReplacement.maskPrompt')}
                  placeholder={t('backgroundReplacement.maskPromptPlaceholder')}
                  value={maskPrompt}
                  onChange={(e) => setBackgroundParameters({ maskPrompt: e.target.value })}
                  helperText={t('backgroundReplacement.maskPromptHelp')}
                />
              </Stack>
            </AccordionDetails>
          </Accordion>

          {/* Advanced Parameters */}
          <Accordion sx={{ mb: 2 }}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="advanced-parameters-content"
              id="advanced-parameters-header"
            >
              <Typography variant="h6">{t('backgroundReplacement.advancedParameters')}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                {/* Model ID */}
                <FormControl fullWidth>
                  <InputLabel>{t('backgroundReplacement.modelId')}</InputLabel>
                  <Select
                    value={modelId}
                    onChange={(e) => setBackgroundParameters({ modelId: e.target.value })}
                    label="Model ID"
                  >
                    <MenuItem value="amazon.nova-canvas-v1:0">Amazon Nova Canvas v1.0</MenuItem>
                  </Select>
                </FormControl>

                {/* OutPainting Mode */}
                <FormControl fullWidth>
                  <InputLabel>{t('backgroundReplacement.outPaintingMode')}</InputLabel>
                  <Select
                    value={outPaintingMode}
                    onChange={(e) => setBackgroundParameters({ outPaintingMode: e.target.value as 'DEFAULT' | 'PRECISE' })}
                    label="OutPainting Mode"
                  >
                    <MenuItem value="DEFAULT">Default</MenuItem>
                    <MenuItem value="PRECISE">Precise</MenuItem>
                  </Select>
                </FormControl>

                {/* CFG Scale */}
                <Box>
                  <Typography gutterBottom>{t('backgroundReplacement.cfgScale')}: {cfgScale}</Typography>
                  <Slider
                    value={cfgScale}
                    onChange={(_, value) => setBackgroundParameters({ cfgScale: value as number })}
                    min={1.1}
                    max={10.0}
                    step={0.1}
                    valueLabelDisplay="auto"
                  />
                </Box>

                {/* Number of Images */}
                <TextField
                  fullWidth
                  type="number"
                  label="Number of Images (default: 1)"
                  value={numberOfImages}
                  onChange={(e) => setBackgroundParameters({ numberOfImages: Number(e.target.value) })}
                  inputProps={{ min: 1, max: 5, step: 1 }}
                />

                {/* Image Size Selector */}
                <ImageSizeSelector
                  width={width}
                  height={height}
                  onSizeChange={(newWidth, newHeight) => {
                    setBackgroundParameters({ width: newWidth, height: newHeight });
                  }}
                  label="Output Image Size"
                />
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
            disabled={isLoading || !sourceImage || !prompt.trim()}
          >
            {isLoading ? t('backgroundReplacement.generating') : t('backgroundReplacement.generateBackground')}
          </Button>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setBackgroundLoadingState({ error: null })}>
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
          onSelectImage={setBackgroundSelectedImageIndex}
          loading={isLoading}
          title={t('backgroundReplacement.generatedImages')}
          emptyMessage={t('backgroundReplacement.emptyMessage')}
          loadingMessage={
            uploadProgress ? 'Uploading images...' : 
            processingProgress ? 'Processing background replacement...' : 
            downloadProgress ? 'Retrieving generated images...' : 'Generating images...'
          }
          downloadFileName={`background-replacement-${selectedImageIndex + 1}.png`}
        />
      </Stack>
    </>
  );
};

export default BackgroundReplacement;
