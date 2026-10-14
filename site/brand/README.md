# AIVANE 品牌

AIVANE = AI + vane（风向标）。标识用向右上方的双叶箭头组成 V，小圆点代表捕捉到的信号，呼应“看全球 AI，找国内应用机会”。

- 主图形：`logo.svg`；深绿 `#102824`、薄荷绿 `#59e2bb`、浅薄荷 `#a6f3da`。
- 网页字标：`Logo.tsx` 读取 `artwork.ts` 的路径，文字颜色随页面主题变化。字形由仓库已有的 Noto Sans SC bold 转成轮廓，不依赖访客安装字体。
- 分享图：`wordmark.svg` 用于浅色，`wordmark-dark.svg` 用于深色；两者 viewBox 为 `0 0 332 64`。
- 安装与浏览器图标：`icon.png` 512px、`icon-192.png` 192px、`apple-icon.png` 180px；`favicon.ico` 包含 16、32、48、64、256px。

修改图形时同步组件路径和静态资产；浏览器图标的版本标记在 `apps/web/app/root.tsx` 与 `site/public/manifest.webmanifest`。分享图模板版本用于让旧图片缓存失效。
