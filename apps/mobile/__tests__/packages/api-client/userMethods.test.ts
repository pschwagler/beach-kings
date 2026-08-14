import { createApiMethods } from '../../../../../packages/api-client/src/methods';
import type { ApiClient } from '../../../../../packages/api-client/src/client';

function makeClient(overrides: Record<string, jest.Mock>): ApiClient {
  return {
    axiosInstance: {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      ...overrides,
    },
  } as unknown as ApiClient;
}

describe('profile photo API methods', () => {
  it('uploads a native image with a boundary-safe multipart request', async () => {
    const post = jest.fn().mockResolvedValue({
      data: { profile_picture_url: 'https://cdn.example.com/avatar.jpg' },
    });
    const methods = createApiMethods(makeClient({ post }));

    await expect(methods.uploadAvatar({
      uri: 'file:///tmp/avatar.jpg',
      name: 'avatar.jpg',
      type: 'image/jpeg',
    })).resolves.toEqual({
      profile_picture_url: 'https://cdn.example.com/avatar.jpg',
    });

    expect(post).toHaveBeenCalledWith(
      '/api/users/me/avatar',
      expect.any(FormData),
      { headers: { 'Content-Type': undefined } },
    );
  });

  it('deletes the current profile photo', async () => {
    const deleteMethod = jest.fn().mockResolvedValue({
      data: { message: 'Avatar removed' },
    });
    const methods = createApiMethods(makeClient({ delete: deleteMethod }));

    await expect(methods.deleteAvatar()).resolves.toEqual({
      message: 'Avatar removed',
    });
    expect(deleteMethod).toHaveBeenCalledWith('/api/users/me/avatar');
  });
});
