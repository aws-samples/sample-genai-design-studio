import React, { Component, type ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Box
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          minHeight="100vh"
          gap={2}
          p={3}
        >
          <Typography variant="h4" color="error">
            Something went wrong
          </Typography>
          <Typography variant="body1" color="text.secondary" textAlign="center">
            An error occurred while loading the application. Please try refreshing the page.
          </Typography>
          {this.state.error && (
            <Typography variant="caption" color="text.secondary" textAlign="center">
              Error: {this.state.error.message}
            </Typography>
          )}
          <Button variant="contained" onClick={this.handleReset}>
            Try Again
          </Button>
          <Button variant="outlined" onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
