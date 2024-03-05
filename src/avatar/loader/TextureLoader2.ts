import axios from 'axios';
import { Texture, TextureLoader } from 'three';

export class TextureLoader2 extends TextureLoader {
  toBase64(blob: Blob): Promise<string> {
    const fileReaderInstance = new FileReader();
    fileReaderInstance.readAsDataURL(blob);
    return new Promise((resolve, reject) => {
      let done = false;
      fileReaderInstance.onload = () => {
        if (done) return;
        done = true;
        resolve(fileReaderInstance.result as string);
      };
      fileReaderInstance.onerror = (err) => {
        if (done) return;
        done = true;
        reject(err);
      };
    });
  }

  load(url: string, onLoad?, onProgress?, onError?) {
    const texture = new Texture();

    axios
      .get(url, {
        responseType: 'blob',
        headers: {
          ...(this.requestHeader || {}),
        },
        withCredentials: this.withCredentials,
      })
      .then(async (res) => {
        const img = document.createElementNS(
          'http://www.w3.org/1999/xhtml',
          'img',
        ) as HTMLImageElement;
        const dataUrl = await this.toBase64(res.data);
        img.src = dataUrl;

        texture.image = img;
        texture.needsUpdate = true;
        onLoad && onLoad(texture);
      })
      .catch((err) => {
        onError && onError(err);
        return Promise.resolve();
      });

    return texture;
  }
}
