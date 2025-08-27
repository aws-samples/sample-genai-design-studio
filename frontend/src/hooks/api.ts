import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';

// 環境変数から設定を取得
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'; // 開発環境用
const VTO_BUCKET = import.meta.env.VITE_VTO_BUCKET || 'vto-app-local'; // バケット名

// APIクライアントの作成
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// リクエスト前に実行されるインターセプターを追加
apiClient.interceptors.request.use(async (config) => {
  try {
    // 現在のセッションからIDトークンを取得
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    
    // トークンがある場合はヘッダーに追加
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      console.warn('No auth token available for API request');
    }
  } catch (error) {
    console.error('Error getting auth token:', error);
    // エラーがあってもリクエストは続行（未認証として処理）
  }
  
  return config;
}, (error) => {
  return Promise.reject(error);
});

// オブジェクト名生成APIを呼び出す
export const generateObjectNames = async (groupId: string, userId: string) => {
  try {
    const response = await apiClient.get(`/utils/get/objectname`, {
      params: {
        group_id: groupId,
        user_id: userId,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error generating object names:', error);
    throw error;
  }
};

// 画像をBase64に変換する
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // "data:image/jpeg;base64," の部分を削除
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

// S3にファイルをアップロードするためのpresigned URLを取得
export const getPresignedUploadUrl = async (objectName: string, expiration: number = 900) => {
  try {
    const response = await apiClient.post('/utils/s3url/upload', {
      object_name: objectName,
      expiration: expiration
    });
    return response.data;
  } catch (error) {
    console.error('Error getting presigned upload URL:', error);
    throw error;
  }
};

// S3からファイルをダウンロードするためのpresigned URLを取得
export const getPresignedDownloadUrl = async (objectName: string, expiration: number = 900) => {
  try {
    const response = await apiClient.post('/utils/s3url/download', {
      object_name: objectName,
      expiration: expiration
    });
    return response.data;
  } catch (error) {
    console.error('Error getting presigned download URL:', error);
    throw error;
  }
};

// presigned URLを使用してS3にファイルをアップロード
export const uploadFileToS3 = async (file: File, presignedUrl: string): Promise<boolean> => {
  try {
    const response = await axios.put(presignedUrl, file, {
      headers: {
        'Content-Type': file.type
      }
    });
    return response.status === 200;
  } catch (error) {
    console.error('Error uploading file to S3:', error);
    throw error;
  }
};

// presigned URLを使用してS3から画像をダウンロード
export const downloadImageFromS3 = async (presignedUrl: string): Promise<string> => {
  try {
    const response = await axios.get(presignedUrl, {
      responseType: 'blob'
    });
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert blob to base64'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(response.data);
    });
  } catch (error) {
    console.error('Error downloading image from S3:', error);
    throw error;
  }
};

// VTO処理APIを呼び出す
export const processNovaVTO = async (params: {
  groupId: string;
  userId: string;
  dateFolder: string;
  timestamp: string;
  uid: string;
  objectNames: string[];
  sourceImageObjectName: string;
  referenceImageObjectName: string;
  maskImageObjectName?: string;
  maskType?: string;
  maskPrompt?: string;
  garmentClass?: string;
  longSleeveStyle?: string;
  tuckingStyle?: string;
  outerLayerStyle?: string;
  maskShape?: string;
  maskShapePrompt?: string;
  preserveBodyPose?: string;
  preserveHands?: string;
  preserveFace?: string;
  mergeStyle?: string;
  returnMask?: boolean;
  numberOfImages?: number;
  quality?: string;
  cfgScale?: number;
  seed?: number;
}) => {
  try {
    const response = await apiClient.post('/vto/nova/process', {
      group_id: params.groupId,
      user_id: params.userId,
      date_folder: params.dateFolder,
      timestamp: params.timestamp,
      uid: params.uid,
      object_names: params.objectNames,
      source_image_object_name: params.sourceImageObjectName,
      reference_image_object_name: params.referenceImageObjectName,
      mask_image_object_name: params.maskImageObjectName,
      mask_type: params.maskType || 'GARMENT',
      mask_prompt: params.maskPrompt || '',
      garment_class: params.garmentClass || 'UPPER_BODY',
      long_sleeve_style: params.longSleeveStyle,
      tucking_style: params.tuckingStyle,
      outer_layer_style: params.outerLayerStyle,
      mask_shape: params.maskShape || 'DEFAULT',
      mask_shape_prompt: params.maskShapePrompt || 'DEFAULT',
      preserve_body_pose: params.preserveBodyPose || 'DEFAULT',
      preserve_hands: params.preserveHands || 'DEFAULT',
      preserve_face: params.preserveFace || 'DEFAULT',
      merge_style: params.mergeStyle,
      return_mask: params.returnMask || false,
      number_of_images: params.numberOfImages || 1,
      quality: params.quality || 'standard',
      cfg_scale: params.cfgScale || 3.0,
      seed: params.seed || -1,
    });
    return response.data;
  } catch (error) {
    console.error('Error processing VTO:', error);
    throw error;
  }
};

// Nova Model処理APIを呼び出す
export const processNovaModel = async (params: {
  groupId: string;
  userId: string;
  dateFolder: string;
  timestamp: string;
  uid: string;
  objectNames: string[];
  prompt: string;
  modelId?: string;
  cfgScale?: number;
  height?: number;
  width?: number;
  numberOfImages?: number;
}) => {
  try {
    const response = await apiClient.post('/vto/nova/model', {
      group_id: params.groupId,
      user_id: params.userId,
      date_folder: params.dateFolder,
      timestamp: params.timestamp,
      uid: params.uid,
      object_names: params.objectNames,
      prompt: params.prompt,
      model_id: params.modelId || 'amazon.nova-canvas-v1:0',
      cfg_scale: params.cfgScale || 8.0,
      height: params.height || 1024,
      width: params.width || 1024,
      number_of_images: params.numberOfImages || 1,
    });
    return response.data;
  } catch (error) {
    console.error('Error processing Nova Model:', error);
    throw error;
  }
};

// Background Replacement処理APIを呼び出す
export const processBackgroundReplacement = async (params: {
  groupId: string;
  userId: string;
  dateFolder: string;
  timestamp: string;
  uid: string;
  objectNames: string[];
  prompt: string;
  inputImageObjectName: string;
  maskPrompt?: string;
  maskImageObjectName?: string;
  modelId?: string;
  outPaintingMode?: 'DEFAULT' | 'PRECISE' | 'RELAXED';
  cfgScale?: number;
  numberOfImages?: number;
  height?: number;
  width?: number;
}) => {
  try {
    const response = await apiClient.post('/vto/nova/background', {
      group_id: params.groupId,
      user_id: params.userId,
      date_folder: params.dateFolder,
      timestamp: params.timestamp,
      uid: params.uid,
      object_names: params.objectNames,
      prompt: params.prompt,
      input_image_object_name: params.inputImageObjectName,
      mask_prompt: params.maskPrompt || 'people',
      mask_image_object_name: params.maskImageObjectName,
      model_id: params.modelId || 'amazon.nova-canvas-v1:0',
      outPaintingMode: params.outPaintingMode || 'DEFAULT',
      cfg_scale: params.cfgScale || 5.0,
      number_of_images: params.numberOfImages || 1,
      height: params.height || 512,
      width: params.width || 512,
    });
    return response.data;
  } catch (error) {
    console.error('Error processing Background Replacement:', error);
    throw error;
  }
};

// Garment Classification APIを呼び出す
export const classifyGarment = async (file: File, groupId?: string, userId?: string) => {
  try {
    console.log('📡 Calling classify-garment API with file:', file.name, 'Size:', file.size, 'Type:', file.type);
    
    // Convert file to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:image/...;base64, prefix
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Use provided IDs or fallback to defaults
    const group_id = groupId || 'default_group';
    const user_id = userId || 'default_user';
    
    const requestBody = {
      group_id,
      user_id,
      image_base64: base64
    };
    
    console.log('📤 Sending POST request to /vto/classify-garment with body keys:', Object.keys(requestBody));
    
    const response = await apiClient.post('/vto/classify-garment', requestBody, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log('📥 Received response:', response.status, response.data);
    return response.data;
  } catch (error) {
    console.error('🚨 Error classifying garment:', error);
    throw error;
  }
};

// S3からデータをダウンロードする (レガシーメソッド - 互換性のために残す)
export const downloadFromS3 = async (objectName: string) => {
  try {
    const response = await apiClient.get(`/utils/get/data`, {
      params: {
        object_name: objectName,
        bucket_name: VTO_BUCKET, // バケット名を明示的に指定
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error downloading from S3:', error);
    throw error;
  }
};
