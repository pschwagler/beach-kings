import type { AxiosInstance } from 'axios';
import { createLeagueMethods } from '../../../../../packages/api-client/src/leagueMethods';

it('reads the authenticated picture with cancellation and uses multipart upload without a JSON content type', async () => {
  const picture = { data_uri: 'data:image/jpeg;base64,dGVzdA==', revision: 'new' };
  const get = jest.fn().mockResolvedValue({ data: picture });
  const post = jest.fn().mockResolvedValue({ data: picture });
  const remove = jest.fn().mockResolvedValue({ data: { data_uri: null, revision: null } });
  const methods = createLeagueMethods({ get, post, delete: remove } as unknown as AxiosInstance);
  const controller = new AbortController();
  expect(await methods.getLeaguePicture(3, { signal: controller.signal })).toEqual(picture);
  expect(get).toHaveBeenCalledWith('/api/leagues/3/picture', expect.objectContaining({ signal: controller.signal }));
  await methods.uploadLeaguePicture(3, { uri: 'file:///picture.jpg', name: 'picture.jpg', type: 'image/jpeg' });
  expect(post).toHaveBeenCalledWith('/api/leagues/3/picture', expect.any(FormData), { headers: { 'Content-Type': undefined } });
  expect(await methods.removeLeaguePicture(3)).toEqual({ data_uri: null, revision: null });
  expect(remove).toHaveBeenCalledWith('/api/leagues/3/picture');
});
