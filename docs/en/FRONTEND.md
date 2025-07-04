# Frontend Testing Guide

## Overview

This document explains frontend testing for the VTO application. We use Vitest as the testing framework, combined with React Testing Library and Jest DOM to build a comprehensive test suite.

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CloudFront    │    │  API Gateway    │    │    Lambda       │
│      WAF        │───▶│      WAF        │───▶│   (FastAPI)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                ▲                       ▲
                                │                       │
┌─────────────────┐            JWT                    JWT
│     Cognito     │         Token                  Verification
│   UserPool      │──────────────┘                       │
└─────────────────┘                                      │
        ▲                                                │
        │                                                │
┌─────────────────┐                              ┌─────────────────┐
│   React App     │                              │   JWKS          │
│   (Amplify)     │                              │   Endpoint      │
└─────────────────┘                              └─────────────────┘
```

## Test Environment Setup

### 1. Automatic Setup

A script is provided to automatically set up the test environment:

```bash
cd vto-app/frontend
./test/test_setup.zsh
```

This script performs the following:
- Verify dependency installation
- Set up test environment variables (create `.env.test` file)
- Display test execution options

### 2. Manual Setup

For manual setup:

```bash
# Install dependencies
npm install

# Create test environment variables file
cat > .env.test << EOF
VITE_API_BASE_URL=http://localhost:8000
VITE_VTO_BUCKET=test-vto-bucket
VITE_GEN_IMAGE_FUNCTION_NAME=test-gen-image-function
EOF
```

## Running Tests
### Execute Setup Script
```bash
cd vto-app/frontend
./test/test_setup.zsh
```
### Run Tests Manually
```bash
# Run all tests
npm test

# Run tests in watch mode (monitor file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests in UI mode (view test results in browser)
npm run test:ui
```

### Running Specific Tests

```bash
# Test specific file only
npm test -- src/components/__tests__/Navigation.test.tsx

# Run tests with pattern matching
npm test -- --grep "Navigation"

# Run tests in specific directory only
npm test -- src/components/__tests__/
```

## Detailed Test Items

### api.test.ts (API Hook Function Tests)

#### generateObjectNames
**Purpose**: Test the object name generation API `/utils/get/objectname`

**Input**:
- `sellerId: 'seller123'` - Seller ID
- `itemId: 'item456'` - Item ID

**Test Case 1: Normal Case**
- **API call**: `GET /utils/get/objectname` with params `{seller_id: 'seller123', item_id: 'item456'}`
- **Expected Output**: `{date_folder: '2024-01-01', timestamp: '123456789', uid: 'test-uid'}`
- **Verification**: API called with correct endpoint and parameters, response data returned normally

**Test Case 2: Error Case**
- **Input**: Situation where API call fails
- **Expected Output**: `Error('API Error')` is thrown
- **Verification**: Appropriate exception occurs when API fails

#### fileToBase64
**Purpose**: Test file to Base64 string conversion functionality

**Test Case 1: Normal Conversion**
- **Input**: `File(['test content'], 'test.txt', {type: 'text/plain'})`
- **Mock FileReader result**: `'data:text/plain;base64,dGVzdCBjb250ZW50'`
- **Expected Output**: `'dGVzdCBjb250ZW50'` (Base64 part only)
- **Verification**: FileReader works normally and Base64 data is extracted

**Test Case 2: Read Error**
- **Input**: `File(['test content'], 'test.txt', {type: 'text/plain'})`
- **Mock FileReader**: Error event occurs
- **Expected Output**: Promise rejection with `Error('Read error')`
- **Verification**: Promise rejects when FileReader error occurs

#### getPresignedUploadUrl
**Purpose**: Test S3 upload presigned URL acquisition

**Test Case 1: Default Expiration**
- **Input**: `objectName: 'test-object'`
- **API call**: `POST /utils/s3url/upload` with `{object_name: 'test-object', expiration: 900}`
- **Expected Output**: `{url: 'https://s3.amazonaws.com/presigned-upload-url'}`
- **Verification**: Presigned URL generation with default 15 minutes (900 seconds) expiration

**Test Case 2: Custom Expiration**
- **Input**: `objectName: 'test-object', expiration: 1800`
- **API call**: `POST /utils/s3url/upload` with `{object_name: 'test-object', expiration: 1800}`
- **Expected Output**: `{url: 'https://s3.amazonaws.com/presigned-upload-url'}`
- **Verification**: Presigned URL generation with specified expiration (30 minutes)

#### getPresignedDownloadUrl
**Purpose**: Test S3 download presigned URL acquisition

- **Input**: `objectName: 'test-object'`
- **API call**: `POST /utils/s3url/download` with `{object_name: 'test-object', expiration: 900}`
- **Expected Output**: `{url: 'https://s3.amazonaws.com/presigned-download-url'}`
- **Verification**: Download presigned URL is generated normally

#### uploadFileToS3
**Purpose**: Test S3 file upload functionality

**Test Case 1: Success Case**
- **Input**: 
  - `file: File(['test content'], 'test.txt', {type: 'text/plain'})`
  - `url: 'https://s3.amazonaws.com/presigned-upload-url'`
- **Mock axios.put response**: `{status: 200}`
- **Expected Output**: `true`
- **Verification**: File uploaded with correct Content-Type header

**Test Case 2: Failure Case**
- **Input**: Same as above
- **Mock axios.put response**: `{status: 403}`
- **Expected Output**: `false`
- **Verification**: Returns false for non-200 status

#### downloadImageFromS3
**Purpose**: Test S3 image download and Base64 conversion

- **Input**: `url: 'https://s3.amazonaws.com/presigned-download-url'`
- **Mock axios.get response**: `{data: Blob(['image data'], {type: 'image/jpeg'})}`
- **Mock FileReader result**: `'data:image/jpeg;base64,aW1hZ2UgZGF0YQ=='`
- **Expected Output**: `'data:image/jpeg;base64,aW1hZ2UgZGF0YQ=='`
- **Verification**: Blob format image data converted to Base64 format

#### processNovaVTO
**Purpose**: Test Nova VTO processing API call

**Test Case 1: All Parameters Specified**
- **Input**:
  ```typescript
  {
    sellerId: 'seller123', itemId: 'item456',
    dateFolder: '2024-01-01', timestamp: '123456789', uid: 'test-uid',
    objectNames: ['model.jpg', 'garment.jpg'],
    sourceImageObjectName: 'model.jpg', referenceImageObjectName: 'garment.jpg',
    maskType: 'GARMENT', garmentClass: 'UPPER_BODY',
    numberOfImages: 2, quality: 'premium', cfgScale: 5.0, seed: 42
  }
  ```
- **API call**: `POST /vto/nova/process` with converted parameters
- **Expected Output**: `{status: 'success', object_names: ['output1.jpg']}`
- **Verification**: All parameters converted to correct API format and sent

**Test Case 2: Using Default Values**
- **Input**: Only minimum parameters specified
- **Verified Default Values**:
  - `mask_type: 'GARMENT'`
  - `garment_class: 'UPPER_BODY'`
  - `number_of_images: 1`
  - `quality: 'standard'`
  - `cfg_scale: 3.0`
  - `seed: -1`

#### processNovaModel
**Purpose**: Test Nova Model generation API call

**Test Case 1: All Parameters Specified**
- **Input**:
  ```typescript
  {
    sellerId: 'seller123', itemId: 'item456',
    dateFolder: '2024-01-01', timestamp: '123456789', uid: 'test-uid',
    objectNames: ['output.jpg'], prompt: 'A beautiful landscape',
    modelId: 'amazon.nova-pro-v1:0', cfgScale: 10.0,
    height: 512, width: 512, numberOfImages: 3
  }
  ```
- **API call**: `POST /vto/nova/model` with converted parameters
- **Expected Output**: `{status: 'success', object_names: ['generated1.jpg']}`
- **Verification**: Image generation parameters sent correctly

**Test Case 2: Using Default Values**
- **Input**: Minimum parameters (prompt only)
- **Verified Default Values**:
  - `model_id: 'amazon.titan-image-generator-v2:0'`
  - `cfg_scale: 8.0`
  - `height: 1024, width: 1024`
  - `number_of_images: 1`

#### processBackgroundReplacement
**Purpose**: Test background replacement processing API call

**Test Case 1: Basic Background Replacement**
- **Input**:
  ```typescript
  {
    sellerId: 'seller123', itemId: 'item456',
    dateFolder: '2024-01-01', timestamp: '123456789', uid: 'test-uid',
    objectNames: ['bg_replaced.jpg'],
    sourceImageObjectName: 'source.jpg',
    backgroundPrompt: 'Beautiful beach with clear blue sky'
  }
  ```
- **API call**: `POST /background-replacement/process` with converted parameters
- **Expected Output**: `{status: 'accepted', object_names: ['bg_replaced.jpg']}`
- **Verification**: Background replacement parameters sent correctly

**Test Case 2: Using Mask Prompt**
- **Input**: Basic parameters + `maskPrompt: 'person, human figure'`
- **Verification**: Mask prompt processed appropriately

**Test Case 3: Using Custom Mask Image**
- **Input**: Basic parameters + `maskImageObjectName: 'custom_mask.png'`
- **Verification**: Custom mask image specification processed correctly

#### downloadFromS3
**Purpose**: Test S3 data download

- **Input**: `objectName: 'test-object.jpg'`
- **API call**: `GET /utils/get/data` with `{object_name: 'test-object.jpg', bucket_name: 'vto-app-local'}`
- **Expected Output**: `{content: 'file content'}`
- **Verification**: Data acquired with specified object name and bucket name

### Navigation.test.tsx
- **Navigation Display**: Confirm display of all menu items
  - Brand name "Nova Canvas" display
  - Each page link display (Home, Virtual Try-On, Model Generation, Settings)
- **Child Content Display**: Confirm display of content passed via children props
- **Navigation Function**: Test screen transitions when menu clicked
  - Confirm useNavigate hook calls
  - Confirm transitions to correct paths
- **Active State Display**: Confirm current page highlight display
  - Current path acquisition via useLocation hook
  - Confirm selected state of corresponding menu items
- **Mobile Display**: Test responsive design
  - Menu button display in mobile view
  - Drawer menu open/close operations
  - Automatic drawer close after mobile navigation

### ImageUpload.test.tsx
- **Basic Display**: Confirm basic component rendering
  - Label text display
  - Upload prompt message display
- **Mask Edit Display**: Display control via allowMask property
  - "(mask editable)" display when mask editing is enabled
  - Hidden when mask editing is disabled
- **Image Display**: Confirm uploaded image display
  - Image display as background image
  - Upload prompt message hidden
- **Height Setting**: Confirm custom height and default height application
  - Apply height specified in props
  - Apply default 512px
- **File Drop**: File handling using react-dropzone
  - Callback calls when files dropped
  - Display changes during drag active state
  - Confirm image file format restrictions

### Home.test.tsx
- **Main Title Display**: Confirm homepage title display
  - "Amazon Nova Canvas" title
  - Subtitle display
- **Feature Card Display**: Confirm display of feature introduction cards
  - Virtual Try-On card display and description
  - Model Generation card display and description
- **Navigation Function**: Test screen transitions when cards clicked
  - Transition to Virtual Try-On page
  - Transition to Model Generation page
- **UI Elements**: Confirm icons and layout
  - SVG icon display
  - Hover effect style application
  - Grid layout confirmation

### Settings.test.tsx
- **Settings Title Display**: Confirm settings page title "設定" display
- **Settings Item Display**: Confirm display of all setting options
  - Dark mode setting and its description
  - Notification setting and its description
  - Auto-save setting and its description
- **Auto-save Message**: Display auto-save notification message
- **Settings Toggle Function**: Test toggle operation for each setting
  - Dark mode setting ON/OFF toggle
  - Notification setting ON/OFF toggle
  - Auto-save setting ON/OFF toggle
- **Independent State Management**: Confirm independent state management for each setting
  - Confirm one setting change doesn't affect others
- **UI Structure**: Confirm Material-UI component structure
  - List structure within Paper component
  - Divider display between settings
  - Switch placement in ListItemSecondaryAction
