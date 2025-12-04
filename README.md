# GenAI Design Studio

[日本語](./README.ja.md) | English

This sample is a Virtual Try-On solution leveraging image generation AI (Amazon Bedrock Canvas). It aims to improve efficiency in various processes from clothing design to actual model fitting photography in the apparel industry and e-commerce services.

## Features
![demo](./img/demo.gif)
### 1. Model Generation
A feature that generates virtual model images by specifying body pose, appearance characteristics, and shooting environment as text prompts.

**Supported Models:**
- **Amazon Nova 2 Omni** (default): Next-generation multimodal model with fast parallel generation and high-precision image generation
- **Amazon Nova Canvas**: High-quality image generation with detailed parameter control

**Key Features:**
- **Text Input**: Detailed image description specification through prompts in various languages including English and Japanese
- **Model Selection**: Choose between Nova 2 Omni or Nova Canvas via dropdown menu
- **Generation Parameters**:
  - Quality control through CFG Scale (1.1-10.0) - Nova Canvas only
  - Image size selection (1024x1024, 768x1344, etc.)
  - Multiple image simultaneous generation (up to 5 images)
  - Nova 2: Fast multi-image generation through parallel Lambda execution

### 2. Image Editing
Image editing functionality using Amazon Nova 2 Omni. You can apply edits specified by natural language prompts to existing images.

**Key Features:**
- **Image Upload**: Upload images to edit (JPEG/PNG/WebP supported, automatic PNG conversion)
- **Edit Prompt**: Specify edit content in natural language in English or Japanese (up to 1024 characters)
- **Image Size Preservation**: Generate edited images at the same size as input images
- **Image Size Validation**: Display warning if not Nova 2 recommended sizes (2880x1440, 2048x2048, etc.)
- **Multiple Image Generation**: Generate up to 5 edit variations in parallel
- **S3 Polling**: Automatic detection of image generation completion through asynchronous processing

**Use Cases:**
- Change clothing colors ("Change red dress to blue")
- Add/change backgrounds ("Add mountains and lake to background")
- Add accessories ("Add sunglasses")
- Adjust lighting/atmosphere ("Change to golden hour lighting")

### 3. Virtual Try-On
Virtual try-on functionality using Amazon Nova Canvas. You can use model images created in Model Generation or existing images to dress up while maintaining the details of clothing images. You can also specify details such as jacket open/closed and shirt in/out.

**Key Features:**
- **Image Specification**: Model image, garment image, (mask image)
- **Mask Types**:
  - `GARMENT`: Automatic garment type detection (upper body, lower body, full body, etc.)
  - `PROMPT`: Mask area specification through text prompts
  - `IMAGE`: Pinpoint specification through custom mask images
- **Paint Editor**: Create mask images using drawing tools over model images
- **Detailed Parameters**:
  - Garment class (18 types), style settings (sleeves, hem, outer, etc.)
  - Body pose, hand, and face preservation settings
  - Merge style (Balanced/Seamless/Detailed)
- **Generation Settings**: Multiple image generation (up to 5 images), quality selection, CFG scale adjustment



### Management Features
- **User Login**: User management through Amazon Cognito User Pool
- **Access Control**: Control of source IP and registered user email domain names
- **Self Sign-up Feature**: Enable/disable control of user registration functionality in the app

## Use Cases
### Test Marketing
Prepare multiple sample variation images before commercial sales of clothing, generate images of models wearing them using Virtual Try-On functionality, and conduct test marketing on social media platforms.
### Uniform Proposals
For sports team uniforms or school uniforms, use Virtual Try-On generated images during client proposals to provide more concrete presentations.
### Planning
Before photography, try Virtual Try-On with multiple sample variations to select appropriate models, shooting locations, and combinations of pants and jackets for each garment.

## Deploy
Please refer to the [DEPLOYMENT document](./docs/en/DEPLOYMENT.md) to execute deployment to AWS environment.

## Architecture
![architecture](./img/architecture.png)

- **Frontend**: React + Vite + TypeScript + MUI
- **Backend API**: FastAPI (Lambda) + Amazon Cognito Authentication
- **Image Generation**: Python Lambda + Amazon Nova 2 Omni / Amazon Nova Canvas
- **Infrastructure**: AWS CDK (TypeScript)
- **Storage**: Amazon S3
- **Security**: AWS WAF + Amazon Cognito
- **Authentication**: AWS Cognito + JWT

## Project Structure

```
vto-app/
├── frontend/               # React frontend application
│   ├── src/               # Source code
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── auth/          # Authentication related
│   │   ├── contexts/      # React contexts
│   │   ├── hooks/         # Custom hooks
│   │   ├── stores/        # State management
│   │   ├── utils/         # Utilities
│   │   └── __tests__/     # Test files
│   ├── public/            # Static files
│   ├── test/              # Test configuration
│   │   └── test_setup.zsh              # Test execution script
│   └── package.json       # Node.js dependencies
├── lambda/                # Lambda functions
│   ├── api/               # FastAPI application
│   │   ├── app/           # Application code
│   │   │   ├── main.py                  # FastAPI main app
│   │   │   ├── auth/                    # Authentication related
│   │   │   ├── routes/                  # API routes
│   │   │   ├── routes/schemas/          # API schemas
│   │   │   └── utils/                   # Common utilities
│   │   ├── Dockerfile                   # Production Dockerfile
│   │   ├── Dockerfile.dev               # Development Dockerfile
│   │   └── requirements.txt             # Python dependencies
│   ├── gen_vto_image/     # Image generation Lambda (asynchronous processing)
│   │   ├── index.py                     # Lambda entry point
│   │   ├── utils/                       # Image generation utilities
│   │   └── requirements.txt             # Python dependencies
│   ├── cognito_triggers/  # Cognito Lambda triggers
│   │   └── pre_sign_up/   # Pre sign-up trigger
│   └── test/              # Test files
├── cdk/                   # AWS CDK infrastructure
│   ├── bin/               # CDK application entry point
│   │   └── vto-app.ts                   # CDK main entry
│   ├── lib/               # CDK stack definitions
│   │   ├── vto-app-stack.ts             # Main stack
│   │   ├── frontend-waf-stack.ts        # WAF stack (us-east-1)
│   │   └── constructs/                  # CDK constructs
│   ├── cdk.json           # CDK configuration
│   └── package.json       # Node.js dependencies
├── docs/                  # Documentation
├── img/                   # Documentation images
```

## Contributing

Please check [CONTRIBUTING](./CONTRIBUTING.md).

## License

This project is licensed under the MIT-0 License. Please check [LICENSE](./LICENSE).
