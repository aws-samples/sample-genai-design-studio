import React, { useCallback } from 'react';
import {
  Box,
  Container,
  Typography,
  Stack,
  Paper,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../stores/appStore';
import ImageUpload from '../components/ImageUpload';
import ImageDisplay from '../components/ImageDisplay';
import {
  generateObjectNames,
  getPresignedUploadUrl,
  uploadFileToS3,
  processImageEdit,
  getPresignedDownloadUrl,
  downloadImageFromS3,
} from '../hooks/api';

const ImageEdit: React.FC = () => {
  const { t } = useTranslation();
  const {
    imageEdit,
    setImageEditSourceImage,
    setImageEditGeneratedImages,
    setImageEditSelectedImageIndex,
    setImageEditParameters,
    setImageEditLoadingState,
    resetImageEdit,
  } = useAppStore();



  const handleSourceImageUpload = useCallback(
    (file: File | null) => {
      if (file) {
        const url = URL.createObjectURL(file);
        setImageEditSourceImage(file, url);
      } else {
        setImageEditSourceImage(null, null);
      }
    },
    [setImageEditSourceImage]
  );

  const handlePromptChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setImageEditParameters({ prompt: event.target.value });
    },
    [setImageEditParameters]
  );

  const pollForGeneratedImages = useCallback(
    async (objectNames: string[], maxAttempts = 100) => {
      try {
        const presignedUrlPromises = objectNames.map(objName => 
          getPresignedDownloadUrl(objName, 1800)
        );
        
        const presignedUrlResponses = await Promise.all(presignedUrlPromises);
        const presignedUrls = presignedUrlResponses.map(res => res.url).filter(Boolean);
        
        if (presignedUrls.length === 0) {
          setImageEditLoadingState({ 
            error: t('imageEdit.presignedUrlError'), 
            isLoading: false 
          });
          return;
        }

        const pollWithUrls = async (attemptCount: number) => {
          if (attemptCount >= maxAttempts) {
            setImageEditLoadingState({ 
              error: t('imageEdit.timeoutError'), 
              isLoading: false 
            });
            return;
          }

          try {
            const imageDataUrlPromises = presignedUrls.map(url => downloadImageFromS3(url));
            const imageDataUrls = await Promise.all(imageDataUrlPromises);
            
            const imageObjects = imageDataUrls.map(url => ({
              base64: url.split(',')[1],
              error: false,
              errorMessage: undefined
            }));
            
            setImageEditGeneratedImages(imageObjects);
            setImageEditLoadingState({ isLoading: false });
            return;
          } catch (downloadErr) {
            setTimeout(() => {
              pollWithUrls(attemptCount + 1);
            }, 3000); 
          }
        };

        pollWithUrls(0);

      } catch (err: any) {
        const errorMessage = err.response?.data?.error || err.message || t('imageEdit.pollingError');
        setImageEditLoadingState({ 
          error: `${t('imageEdit.error')}: ${errorMessage}`, 
          isLoading: false 
        });
      }
    },
    [setImageEditGeneratedImages, setImageEditLoadingState, t]
  );

  const handleGenerate = useCallback(async () => {
    // Simple validation
    if (!imageEdit.sourceImageFile) {
      setImageEditLoadingState({ error: t('imageEdit.sourceImageRequired') });
      return;
    }

    if (!imageEdit.parameters.prompt.trim()) {
      setImageEditLoadingState({ error: t('imageEdit.promptRequired') });
      return;
    }

    if (imageEdit.parameters.prompt.length > 1024) {
      setImageEditLoadingState({ error: t('imageEdit.promptTooLong') });
      return;
    }

    try {
      setImageEditLoadingState({
        isLoading: true,
        uploadProgress: true,
        error: null,
      });
      setImageEditGeneratedImages([]);

      const groupId = 'image-edit-group';
      const userId = 'user123';

      const objectNamesResponse = await generateObjectNames(groupId, userId);
      const { date_folder, timestamp, uid } = objectNamesResponse;

      const inputImageObjectName = `${groupId}/${userId}/image_edit/${date_folder}/${uid}/source_image.png`;

      const uploadUrlResponse = await getPresignedUploadUrl(inputImageObjectName);
      const uploadSuccess = await uploadFileToS3(
        imageEdit.sourceImageFile!,
        uploadUrlResponse.url
      );

      if (!uploadSuccess) {
        throw new Error(t('imageEdit.uploadError'));
      }

      setImageEditLoadingState({
        uploadProgress: false,
        processingProgress: true,
      });

      const numberOfImages = 1;
      const outputObjectNames = [];
      for (let i = 0; i < numberOfImages; i++) {
        outputObjectNames.push(
          `${groupId}/${userId}/image_edit/${date_folder}/${uid}/result_${i}.png`
        );
      }

      console.log('📤 Sending image edit request:', {
        groupId,
        userId,
        dateFolder: date_folder,
        timestamp,
        uid,
        objectNames: outputObjectNames,
        prompt: imageEdit.parameters.prompt,
        inputImageObjectName,
        numberOfImages,
      });

      const response = await processImageEdit({
        groupId,
        userId,
        dateFolder: date_folder,
        timestamp,
        uid,
        objectNames: outputObjectNames,
        prompt: imageEdit.parameters.prompt,
        inputImageObjectName,
        numberOfImages,
      });

      console.log('📨 Image edit API response:', response);

      if (response.status === 'accepted') {
        console.log('✅ Request accepted. Starting polling for:', response.object_names);
        pollForGeneratedImages(response.object_names);
      } else {
        console.error('❌ Request not accepted:', response);
        throw new Error(response.error || t('imageEdit.generationError'));
      }
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.detail || err.message || t('imageEdit.unexpectedError');
      setImageEditLoadingState({
        error: `${t('imageEdit.error')}: ${errorMessage}`,
        isLoading: false,
        uploadProgress: false,
        processingProgress: false,
      });
    }
  }, [
    imageEdit.sourceImageFile,
    imageEdit.parameters.prompt,
    setImageEditLoadingState,
    setImageEditGeneratedImages,
    pollForGeneratedImages,
    t,
  ]);

  const handleReset = useCallback(() => {
    resetImageEdit();
  }, [resetImageEdit]);

  const handleImageSelect = useCallback(
    (index: number) => {
      setImageEditSelectedImageIndex(index);
    },
    [setImageEditSelectedImageIndex]
  );

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('imageEdit.title')}
      </Typography>

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3} sx={{ mb: 4, mt: 3 }}>
        <Box sx={{ flex: { xs: 1, lg: 1 }, maxWidth: { lg: '33%' } }}>
          <Accordion defaultExpanded sx={{ mb: 2 }}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="source-image-content"
              id="source-image-header"
            >
              <Typography variant="h6">{t('imageEdit.sourceImage')}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <ImageUpload
                onImageUpload={handleSourceImageUpload}
                uploadedImage={imageEdit.sourceImage}
                label={t('imageEdit.uploadSourceImage')}
              />
            </AccordionDetails>
          </Accordion>

          <Accordion defaultExpanded sx={{ mb: 2 }}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="edit-parameters-content"
              id="edit-parameters-header"
            >
              <Typography variant="h6">{t('imageEdit.editPrompt')}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                fullWidth
                multiline
                rows={4}
                value={imageEdit.parameters.prompt}
                onChange={handlePromptChange}
                placeholder={t('imageEdit.promptPlaceholder')}
                disabled={imageEdit.isLoading}
                inputProps={{ maxLength: 1024 }}
                helperText={`${imageEdit.parameters.prompt.length}/1024`}
              />
            </AccordionDetails>
          </Accordion>

          <Button
            variant="contained"
            color="primary"
            fullWidth
            sx={{ mb: 2 }}
            onClick={handleGenerate}
            disabled={imageEdit.isLoading}
            startIcon={
              imageEdit.isLoading ? <CircularProgress size={20} /> : null
            }
          >
            {imageEdit.isLoading
              ? imageEdit.uploadProgress
                ? t('imageEdit.uploading')
                : imageEdit.processingProgress
                ? t('imageEdit.processing')
                : t('imageEdit.downloading')
              : t('imageEdit.generate')}
          </Button>

          {imageEdit.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {imageEdit.error}
            </Alert>
          )}
        </Box>

        <ImageDisplay
          images={imageEdit.generatedImages}
          selectedImageIndex={imageEdit.selectedImageIndex}
          onSelectImage={handleImageSelect}
          loading={imageEdit.isLoading}
          title={t('imageEdit.generatedImages')}
          emptyMessage={t('imageEdit.noImagesGenerated')}
        />
      </Stack>
    </Container>
  );
};

export default ImageEdit;
