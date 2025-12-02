import React, { useState, useCallback } from 'react';
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
} from '@mui/material';
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

  const [pollingIntervals, setPollingIntervals] = useState<ReturnType<typeof setInterval>[]>([]);

  // Cleanup intervals on unmount
  React.useEffect(() => {
    return () => {
      pollingIntervals.forEach(interval => clearInterval(interval));
    };
  }, [pollingIntervals]);

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
    async (objectNames: string[]) => {
      const maxAttempts = 100;
      const intervalMs = 3000;
      const attemptCounts = new Array(objectNames.length).fill(0);
      const completedImages = new Set<number>();
      const fetchedImages: Array<{base64: string; error: boolean}> = [];

      console.log(`🔄 Starting polling for ${objectNames.length} images:`, objectNames);

      const intervals = objectNames.map((objectName, index) => {
        return setInterval(async () => {
          attemptCounts[index]++;
          console.log(`📡 Polling attempt ${attemptCounts[index]}/${maxAttempts} for image ${index}: ${objectName}`);

          if (attemptCounts[index] >= maxAttempts) {
            console.error(`⏱️ Timeout reached for image ${index} after ${maxAttempts} attempts`);
            setImageEditLoadingState({
              error: t('imageEdit.timeoutError'),
              isLoading: false,
              processingProgress: false,
            });
            // Clear all intervals on timeout
            intervals.forEach(interval => clearInterval(interval));
            return;
          }

          try {
            const downloadUrlResponse = await getPresignedDownloadUrl(objectName);
            console.log(`🔗 Presigned URL response for image ${index}:`, downloadUrlResponse);
            
            if (downloadUrlResponse.url) {
              console.log(`⬇️ Fetching image ${index} from S3...`);
              const response = await fetch(downloadUrlResponse.url);
              console.log(`📥 Fetch response for image ${index}: status=${response.status}, ok=${response.ok}`);
              
              if (response.ok) {
                const blob = await response.blob();
                console.log(`✅ Successfully fetched image ${index}: ${blob.size} bytes`);
                
                const base64 = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
                });

                // Add to fetched images array
                fetchedImages.push({ base64, error: false });
                completedImages.add(index);
                console.log(`✨ Image ${index} added to state. Total fetched: ${fetchedImages.length}/${objectNames.length}`);

                // Update state with all fetched images
                setImageEditGeneratedImages([...fetchedImages]);

                // Check if all images are completed
                if (completedImages.size === objectNames.length) {
                  console.log(`🎉 All ${objectNames.length} images completed!`);
                  setImageEditLoadingState({
                    isLoading: false,
                    processingProgress: false,
                    downloadProgress: false,
                  });
                  // Clear all intervals when all images are done
                  intervals.forEach(interval => clearInterval(interval));
                } else {
                  console.log(`⏭️ Clearing interval for image ${index}. Remaining: ${objectNames.length - completedImages.size}`);
                  // Clear only this interval
                  clearInterval(intervals[index]);
                }
              } else {
                console.log(`⏳ Image ${index} not ready yet (status: ${response.status})`);
              }
            } else {
              console.log(`❌ No presigned URL returned for image ${index}`);
            }
          } catch (error) {
            console.error(`❌ Error polling for image ${index}:`, error);
          }
        }, intervalMs);
      });

      setPollingIntervals(intervals);
    },
    [
      setImageEditGeneratedImages,
      setImageEditLoadingState,
      t,
    ]
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
    pollingIntervals.forEach(clearInterval);
    setPollingIntervals([]);
    resetImageEdit();
  }, [pollingIntervals, resetImageEdit]);

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

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={4}>
        <Box sx={{ flex: 1 }}>
          <Paper elevation={3} sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('imageEdit.sourceImage')}
            </Typography>
            <ImageUpload
              onImageUpload={handleSourceImageUpload}
              uploadedImage={imageEdit.sourceImage}
              label={t('imageEdit.uploadSourceImage')}
            />
          </Paper>

          <Paper elevation={3} sx={{ p: 3, mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              {t('imageEdit.editPrompt')}
            </Typography>
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
          </Paper>

          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleGenerate}
              disabled={imageEdit.isLoading}
              startIcon={
                imageEdit.isLoading ? <CircularProgress size={20} /> : null
              }
              sx={{ flex: 1 }}
            >
              {imageEdit.isLoading
                ? imageEdit.uploadProgress
                  ? t('imageEdit.uploading')
                  : imageEdit.processingProgress
                  ? t('imageEdit.processing')
                  : t('imageEdit.downloading')
                : t('imageEdit.generate')}
            </Button>
            <Button variant="outlined" onClick={handleReset} sx={{ flex: 1 }}>
              {t('backgroundReplacement.resetButton')}
            </Button>
          </Box>

          {imageEdit.error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {imageEdit.error}
            </Alert>
          )}
        </Box>

        <Box sx={{ flex: 1 }}>
          <Paper elevation={3} sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('imageEdit.generatedImages')}
            </Typography>
            {imageEdit.generatedImages.length > 0 ? (
              <ImageDisplay
                images={imageEdit.generatedImages}
                selectedImageIndex={imageEdit.selectedImageIndex}
                onSelectImage={handleImageSelect}
                loading={imageEdit.isLoading}
              />
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 200,
                  bgcolor: 'grey.100',
                  borderRadius: 1,
                }}
              >
                <Typography color="text.secondary">
                  {t('imageEdit.noImagesGenerated')}
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>
      </Stack>
    </Container>
  );
};

export default ImageEdit;
