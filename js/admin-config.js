/* =========================================================
   后台配置（上线前请修改口令）
   ---------------------------------------------------------
   修改口令：
     1) 在站点目录运行  node tools/hash-password.js 你的新口令
     2) 把输出的 64 位字符串替换下面的 PASSWORD_HASH
   当前口令：已自定义（不再使用默认的 admin123）
   ========================================================= */
window.ADMIN_CONFIG = {
  // sha256("031014")
  PASSWORD_HASH: "2acd61e6a176956905bae0a0946beec3b3b5b927f3907690abbe67457b1973a5",

  // 仓库默认值（也能在后台「发布设置」里改，后台设置优先）
  REPO: { owner: "", repo: "", branch: "main" },

  // 数据文件（相对仓库根目录）
  FILES: {
    posts: "data/posts.json",
    moments: "data/moments.json",
    photos: "data/photos.json",
    links: "data/links.json",
    site: "data/site.json"
  }
};
