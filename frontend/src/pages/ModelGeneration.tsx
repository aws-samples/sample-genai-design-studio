import React, { useCallback } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  Slider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ImageDisplay from '../components/ImageDisplay';
import ImageSizeSelector from '../components/ImageSizeSelector';
import {
  generateObjectNames,
  getPresignedDownloadUrl,
  downloadImageFromS3,
  processNovaModel,
} from '../hooks/api';
import { validateNovaModelRequest, getValidationErrors } from '../utils/validation';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../stores/appStore';

const ModelGeneration: React.FC = () => {
  const { user } = useAuth();
  
  // Zustand Store
  const {
    modelGeneration: {
      generatedImages,
      selectedImageIndex,
      parameters: {
        prompt,
        modelId,
        cfgScale,
        height,
        width,
        numberOfImages,
      },
      isLoading,
      error,
    },
    setModelGenerationImages,
    setModelGenerationSelectedImageIndex,
    setModelGenerationParameters,
    setModelGenerationLoadingState,
  } = useAppStore();

  // Nova Model用のポーリング関数
  const pollForGeneratedImages = useCallback(async (objectNames: string[], maxAttempts = 100) => {
    try {
      const presignedUrlPromises = objectNames.map(objName => 
        getPresignedDownloadUrl(objName, 1800)
      );
      
      const presignedUrlResponses = await Promise.all(presignedUrlPromises);
      const presignedUrls = presignedUrlResponses.map(res => res.url).filter(Boolean);
      
      if (presignedUrls.length === 0) {
        setModelGenerationLoadingState({ error: 'Failed to obtain presigned URL.', isLoading: false });
        return;
      }

      const pollWithUrls = async (attemptCount: number) => {
        if (attemptCount >= maxAttempts) {
          setModelGenerationLoadingState({ error: 'Image generation failed. Please try again.', isLoading: false });
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
          
          setModelGenerationImages(imageObjects);
          setModelGenerationLoadingState({ isLoading: false });
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
      setModelGenerationLoadingState({ error: `Error: ${errorMessage}`, isLoading: false });
    }
  }, [setModelGenerationImages, setModelGenerationLoadingState]);

  // Nova Model生成処理
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setModelGenerationLoadingState({ error: 'Please enter a prompt.' });
      return;
    }

    setModelGenerationLoadingState({ isLoading: true, error: null });
    setModelGenerationImages([]);
    
    try {
      if (!user?.username) {
        setModelGenerationLoadingState({ error: 'Unable to get user information. Please log in again.', isLoading: false });
        return;
      }
      
      const groupId = 'model-group';
      const userId = user.username;
      const objectNamesResponse = await generateObjectNames(groupId, userId);
      const { date_folder, timestamp, uid } = objectNamesResponse;
      
      // バリデーション用のリクエストオブジェクトを作成
      const requestData = {
        group_id: groupId,
        user_id: userId,
        prompt: prompt,
        model_id: modelId,
        cfg_scale: cfgScale,
        height: height,
        width: width,
        number_of_images: numberOfImages,
      };
      
      // バリデーションを実行
      const validationResult = validateNovaModelRequest(requestData);
      if (!validationResult.success) {
        const errors = getValidationErrors(validationResult.error!);
        const errorMessages = Object.entries(errors).map(([field, message]) => `${field}: ${message}`).join('\n');
        setModelGenerationLoadingState({ error: `Validation Error:\n${errorMessages}`, isLoading: false });
        return;
      }
      
      const generatedObjectNames = [];
      for (let i = 0; i < numberOfImages; i++) {
        generatedObjectNames.push(`${groupId}/${userId}/gen_image/${date_folder}/${uid}/result_${i}.png`);
      }
      
      const modelResponse = await processNovaModel({
        groupId,
        userId,
        dateFolder: date_folder,
        timestamp,
        uid,
        objectNames: generatedObjectNames,
        prompt,
        modelId,
        cfgScale,
        height,
        width,
        numberOfImages,
      });
      
      if (modelResponse.status === 'accepted' && modelResponse.object_names && modelResponse.object_names.length > 0) {
        pollForGeneratedImages(modelResponse.object_names);
      } else {
        setModelGenerationLoadingState({ error: 'Model processing request failed.', isLoading: false });
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Error occurred during model processing.';
      setModelGenerationLoadingState({ error: `Error: ${errorMessage}`, isLoading: false });
    }
  };

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        Model Generation
      </Typography>
      
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3} sx={{ mb: 4, mt: 3 }}>
        {/* Left Side - Prompt and Parameters (1/3) */}
        <Box sx={{ flex: { xs: 1, lg: 1 }, maxWidth: { lg: '33%' } }}>
          <Typography variant="h6" gutterBottom>
            Text Prompt
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Describe the image you want to generate"
            placeholder="e.g., 'A beautiful landscape with mountains and a lake at sunset'"
            value={prompt}
            onChange={(e) => setModelGenerationParameters({ prompt: e.target.value })}
            sx={{ mb: 2 }}
          />

          {/* Generation Parameters Accordion */}
          <Accordion defaultExpanded sx={{ mb: 2 }}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="generation-parameters-content"
              id="generation-parameters-header"
            >
              <Typography variant="h6">Generation Parameters</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>

                <TextField
                  fullWidth
                  type="number"
                  label="Number of Images"
                  value={numberOfImages}
                  onChange={(e) => setModelGenerationParameters({ numberOfImages: Number(e.target.value) })}
                  inputProps={{ min: 1, max: 5, step: 1 }}
                />

                <Box>
                  <Typography gutterBottom>CFG Scale: {cfgScale}</Typography>
                  <Slider
                    value={cfgScale}
                    onChange={(_, value) => setModelGenerationParameters({ cfgScale: value as number })}
                    min={1.1}
                    max={10}
                    step={0.1}
                    valueLabelDisplay="auto"
                  />
                </Box>

                <ImageSizeSelector
                  width={width}
                  height={height}
                  onSizeChange={(newWidth, newHeight) => {
                    setModelGenerationParameters({ width: newWidth, height: newHeight });
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
            disabled={isLoading || !prompt.trim()}
          >
            {isLoading ? 'Generating...' : 'Generate'}
          </Button>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setModelGenerationLoadingState({ error: null })}>
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
          onSelectImage={setModelGenerationSelectedImageIndex}
          loading={isLoading}
          title="Generated Images"
          emptyMessage="Generated images will appear here"
          loadingMessage="Generating images..."
          downloadFileName={`model-generation-${selectedImageIndex + 1}.png`}
        />
      </Stack>
    </>
  );
};

export default ModelGeneration;
