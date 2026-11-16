# 开通两个人的旅行地图同步

首次打开即可在本机记地点。要让两部 iPhone 看到同一本旅行册，需要一个 Supabase 项目、两个邮箱账号，以及下面四步。云端每个地点保存一份共享的状态、日期和笔记。

## 1. 建立云端数据表

在 Supabase 创建专用于这本旅行册的项目，打开 SQL Editor，粘贴并运行同目录 `schema.sql`。确保项目已开启 Data API，且暴露 `public` schema。脚本会创建成员表、地点表、写入函数和访问策略，再次执行会保留已录入的地点。

## 2. 加入两位成员

在 Authentication 的用户管理中分别创建两个已确认邮箱的用户，并为每个人设置独立密码。复制两人的 User UID。回到 SQL Editor，把下面两个占位符替换为实际 UUID 后执行。

```sql
insert into public.travel_members (slot, user_id) values
  (1, '第一位用户的 UUID'),
  (2, '第二位用户的 UUID');
```

数据库最多允许两个成员。只有这两个 UID 可以读写云端旅行记录。需要重置密码时，可在 Supabase 管理账号。

## 3. 连接前端

从项目 Connect / API Keys 复制 Project URL 与 publishable key，编辑仓库中的 `config.js`。

```js
window.TRAVEL_CONFIG = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  publishableKey: "sb_publishable_填入项目的公开密钥"
};
```

只使用 publishable key 或旧版 anon key。两人的密码、secret key、service_role key 均应保存在仓库和前端之外。部署更新后的页面，在两台设备上分别登录。

## 4. 在两部手机上验证

在第一台新增一个「想去」的地点，等同步完成。在第二台打开应用并刷新同步，检查地点与笔记。把它改成「去过」，再回到第一台确认统计和标记均已更新。首次登录会把本机已标记的地点并入共享旅行册。

应用打开时会在保存后、联网后、切回前台时同步，也会每 30 秒检查一次。离线修改会保留在当前设备，应用下次联网打开时继续上传。同一地点在两部设备上都有修改时，按设备记录的最近编辑时间保留整条记录（请开启手机的自动日期与时间）。移除标记的操作也会同步。

退出后会回到本机旅行册；未上传的修改会留在该账号的设备缓存，重新登录同一账号即可继续。清除浏览器数据或卸载应用前，先同步并导出 JSON 备份。恢复备份时按地点合并，备份中同编号地点会覆盖当前内容。JSON 只包含地点编号、状态、日期和笔记。

[Supabase 邮箱密码登录](https://supabase.com/docs/guides/auth/passwords) · [API 密钥](https://supabase.com/docs/guides/getting-started/api-keys) · [行级访问控制](https://supabase.com/docs/guides/database/postgres/row-level-security)
