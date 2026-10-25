/**
 * 生成后台登录口令的 SHA-256 哈希
 * 用法：node tools/hash-password.js 你的密码
 * 把输出粘到 admin.html 里的 const PASSWORD_HASH = "..."（或 js/admin-config.js）
 */
const crypto = require("crypto");
const pw = process.argv[2];
if (!pw) {
  console.log("用法: node tools/hash-password.js <你的密码>");
  process.exit(1);
}
console.log(crypto.createHash("sha256").update(pw, "utf8").digest("hex"));
