import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Paper,
  Typography,
  Stack,
  Collapse,
  Fade,
  TextField,
  Alert,
  CircularProgress,
} from '@mui/material';
import { usePromptEnhancement } from '../hooks/usePromptEnhancement';
import { useAppStore } from '../stores/appStore';

interface PromptEnhancementSectionProps {
  currentPrompt: string;
  onPromptChange: (prompt: string) => void;
}

const PromptEnhancementSection: React.FC<PromptEnhancementSectionProps> = ({
  currentPrompt,
  onPromptChange,
}) => {
  const { t, i18n } = useTranslation();
  const { enhancePrompt } = usePromptEnhancement();
  const [isEditing, setIsEditing] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');

  const {
    modelGeneration: { promptEnhancement },
    setModelGenerationPromptEnhancement,
  } = useAppStore();

  const { isEnhancing, showEnhanced, enhancedPrompt, originalPrompt, error } = promptEnhancement;

  const handleEnhance = async () => {
    if (!currentPrompt.trim()) return;

    setModelGenerationPromptEnhancement({
      isEnhancing: true,
      error: null,
      originalPrompt: currentPrompt,
    });

    const language = i18n.language === 'ja' ? 'ja' : 'en';
    const result = await enhancePrompt(currentPrompt, language);

    if (result) {
      setModelGenerationPromptEnhancement({
        isEnhancing: false,
        showEnhanced: true,
        enhancedPrompt: result.enhanced_prompt,
      });
    } else {
      setModelGenerationPromptEnhancement({
        isEnhancing: false,
        showEnhanced: true,
        error: t('modelGeneration.enhancementError'),
      });
    }
  };

  const handleUseEnhanced = () => {
    if (enhancedPrompt) {
      onPromptChange(enhancedPrompt);
      setModelGenerationPromptEnhancement({
        showEnhanced: false,
        originalPrompt: '',
        enhancedPrompt: '',
        error: null,
      });
    }
  };

  const handleUseOriginal = () => {
    setModelGenerationPromptEnhancement({
      showEnhanced: false,
      originalPrompt: '',
      enhancedPrompt: '',
      error: null,
    });
  };

  const handleEdit = () => {
    setEditedPrompt(enhancedPrompt);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    setModelGenerationPromptEnhancement({
      enhancedPrompt: editedPrompt,
    });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedPrompt('');
  };

  const handleRetry = () => {
    handleEnhance();
  };

  return (
    <Box>
      <Button
        size="small"
        color="secondary"
        onClick={handleEnhance}
        disabled={isEnhancing || !currentPrompt.trim()}
        sx={{ mb: 1 }}
      >
        {isEnhancing ? (
          <>
            <CircularProgress size={16} sx={{ mr: 1 }} />
            {t('modelGeneration.enhancing')}
          </>
        ) : (
          t('modelGeneration.enhancePrompt')
        )}
      </Button>

      <Collapse in={showEnhanced} timeout={300}>
        <Fade in={showEnhanced} timeout={500}>
          <Paper
            elevation={1}
            sx={{
              p: 2,
              mt: 1,
              bgcolor: error ? 'grey.50' : 'grey.100',
              border: 1,
              borderColor: error ? 'error.main' : 'grey.300',
            }}
          >
            {error ? (
              <Stack spacing={2}>
                <Alert severity="error">{error}</Alert>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  onClick={handleRetry}
                  disabled={isEnhancing}
                >
                  {t('modelGeneration.retry')}
                </Button>
              </Stack>
            ) : (
              <Stack spacing={2}>
                <Typography variant="subtitle2">
                  {t('modelGeneration.enhancedPrompt')}
                </Typography>

                {isEditing ? (
                  <TextField
                    fullWidth
                    multiline
                    rows={4}
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                  />
                ) : (
                  <Typography variant="body1">{enhancedPrompt}</Typography>
                )}

                <Stack direction="row" spacing={1}>
                  {isEditing ? (
                    <>
                      <Button size="small" onClick={handleSaveEdit}>
                        {t('modelGeneration.save')}
                      </Button>
                      <Button size="small" onClick={handleCancelEdit}>
                        {t('modelGeneration.cancel')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="small" onClick={handleEdit}>
                        {t('modelGeneration.edit')}
                      </Button>
                      <Button size="small" onClick={handleUseOriginal}>
                        {t('modelGeneration.useOriginal')}
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={handleUseEnhanced}
                      >
                        {t('modelGeneration.useThis')}
                      </Button>
                    </>
                  )}
                </Stack>
              </Stack>
            )}
          </Paper>
        </Fade>
      </Collapse>
    </Box>
  );
};

export default PromptEnhancementSection;
