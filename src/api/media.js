import apiClient from './client';

/**
 * Asks the backend to authorize a direct video upload for this conversation.
 * The backend checks auth + conversation membership before issuing a
 * short-lived, signed set of upload params — see
 * backend/src/services/videoUploadService.js. Never returns the Cloudinary
 * API secret.
 * @param {string} conversationId - Conversation the video will belong to.
 * @returns {Promise<object>} Signed upload authorization.
 */
const requestVideoUploadSignature = async (conversationId) => {
  const response = await apiClient.post('/api/media/upload-signature', { conversationId });
  return response.data.data;
};

/**
 * Uploads a video file directly from the browser to Cloudinary using the
 * signed authorization above — the bytes never pass through our backend.
 * Uses XMLHttpRequest rather than axios/fetch specifically because it's the
 * only option that exposes real upload-progress events for a FormData body.
 * @param {File} file - Video file to upload.
 * @param {object} authorization - Value returned by requestVideoUploadSignature.
 * @param {{onProgress?: (percent: number) => void}} [options] - Progress callback.
 * @returns {Promise<object>} Cloudinary's upload response (includes public_id, secure_url, duration, ...).
 */
const uploadVideoToCloudinary = (file, authorization, { onProgress } = {}) =>
  new Promise((resolve, reject) => {
    const { cloudName, apiKey, signature, timestamp, publicId, allowedFormats } = authorization;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('public_id', publicId);
    if (allowedFormats?.length) {
      formData.append('allowed_formats', allowedFormats.join(','));
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let body;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error('Video upload failed: unexpected response from Cloudinary'));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body);
      } else {
        reject(new Error(body?.error?.message || 'Video upload failed'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during video upload'));
    xhr.onabort = () => reject(new Error('Video upload was cancelled'));

    xhr.send(formData);
  });

export { requestVideoUploadSignature, uploadVideoToCloudinary };
