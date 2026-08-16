/**
 * 将任意图片文件裁剪为圆形并导出透明 PNG（Blob）。
 * 用于宠物自定义头像：前端裁剪 → 上传服务端。
 */
export function cropToCircleBlob(file: File, size = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法创建画布');

        // 正方形取中 + 圆形裁剪
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

        canvas.toBlob(
          (b) => {
            URL.revokeObjectURL(url);
            if (b) resolve(b);
            else reject(new Error('图片处理失败'));
          },
          'image/png',
          0.92
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e as Error);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败，请更换图片'));
    };
    img.src = url;
  });
}
