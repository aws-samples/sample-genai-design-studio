import React from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  CardActionArea,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CheckroomOutlinedIcon from '@mui/icons-material/CheckroomOutlined';
import Person2Icon from '@mui/icons-material/Person2';
import EditOutlined from '@mui/icons-material/EditOutlined';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const features = [
    {
      titleKey: 'home.modelGeneration.title',
      descriptionKey: 'home.modelGeneration.description',
      icon: <Person2Icon sx={{ fontSize: 60 }} />,
      path: '/model-generation',
      color: '#252F3D',
    },
    {
      titleKey: 'home.virtualTryOn.title',
      descriptionKey: 'home.virtualTryOn.description',
      icon: <CheckroomOutlinedIcon sx={{ fontSize: 60 }} />,
      path: '/virtual-try-on',
      color: '#252F3D',
    },
    {
      titleKey: 'home.imageEdit.title',
      descriptionKey: 'home.imageEdit.description',
      icon: <EditOutlined sx={{ fontSize: 60 }} />,
      path: '/image-edit',
      color: '#252F3D',
    },
  ];

  return (
    <Container maxWidth="lg">
      <Box sx={{ textAlign: 'center', mb: 6 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          {t('home.title')}
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 4,
        }}
      >
        {features.map((feature) => (
          <Card
            key={feature.titleKey}
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              transition: 'transform 0.2s',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: 4,
              },
            }}
          >
            <CardActionArea
              onClick={() => navigate(feature.path)}
              sx={{ height: '100%' }}
            >
              <CardContent sx={{ textAlign: 'center', py: 4 }}>
                <Box
                  sx={{
                    color: feature.color,
                    mb: 2,
                  }}
                >
                  {feature.icon}
                </Box>
                <Typography variant="h5" component="h2" gutterBottom>
                  {t(feature.titleKey)}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  {t(feature.descriptionKey)}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Container>
  );
};

export default Home;
