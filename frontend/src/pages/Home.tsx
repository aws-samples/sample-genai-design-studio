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
import CheckroomOutlinedIcon from '@mui/icons-material/CheckroomOutlined';
import Person2Icon from '@mui/icons-material/Person2';
import PhotoSizeSelectActualOutlinedIcon from '@mui/icons-material/PhotoSizeSelectActualOutlined';

const Home: React.FC = () => {
  const navigate = useNavigate();

  const features = [
    {
      title: 'Model Generation',
      description: 'Generate high-quality model images from text prompts to use as the foundation for virtual try-on experiences',
      icon: <Person2Icon sx={{ fontSize: 60 }} />,
      path: '/model-generation',
      color: '#252F3D',
    },
    {
      title: 'Virtual Try-On',
      description: 'Create realistic virtual try-on images by combining garment images with model images',
      icon: <CheckroomOutlinedIcon sx={{ fontSize: 60 }} />,
      path: '/virtual-try-on',
      color: '#252F3D',
    },
    {
      title: 'Background Replacement',
      description: 'Replace backgrounds in model images with text prompts',
      icon: <PhotoSizeSelectActualOutlinedIcon sx={{ fontSize: 60 }} />,
      path: '/background-replacement',
      color: '#252F3D',
    },
  ];

  return (
    <Container maxWidth="lg">
      <Box sx={{ textAlign: 'center', mb: 6 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          Virtual Try-On
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
            key={feature.title}
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
                  {feature.title}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  {feature.description}
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
