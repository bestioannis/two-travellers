# 双人旅图 · Two Travellers

一张两个人共同维护的旅行地图。点选省州、城市或景点，查看旅行资料，标记「去过」或「想去」，并记下日期和手记。旅行护照按地点计数，同一地点保留一条共同记录。地图与旅行资料随应用下载。

正式站点：[打开双人旅图](https://bestioannis.github.io/two-travellers/)

## 本机打开

克隆仓库后，在其上级目录运行下面两行，再打开 http://localhost:8000/ 。

```sh
cd two-travellers
python3 -m http.server 8000 --bind 127.0.0.1
```

## 发布到 GitHub Pages

1. 将这个目录的内容放到你选择的 GitHub 仓库的 main 分支根目录，保留 index.html、assets 文件夹和 .nojekyll。
2. 打开仓库 Settings → Pages，选择 Deploy from a branch，再选 main 和 / (root)，保存。
3. 等 Pages 显示发布完成。从手机 Safari 打开 GitHub 给出的网址，一般为 `https://用户名.github.io/仓库名/`。
4. 从 Safari 分享菜单选「添加到主屏幕」，如出现「作为网页 App 打开」选项请开启。首次联网打开待地图加载和离线缓存完成，再尝试断网重开。

前端可独立部署，所有资源均使用项目相对路径。个人记录保存在浏览器或配置好的 Supabase 中。备份文件应存放在发布目录以外。

## 两人同步与备份

按 [双账号配置](CONFIG.md) 创建两位成员并填写 config.js。两人分别在「双人空间」登录。还可以从这里导出 JSON，或从备份恢复。有同一地点的不同编辑时按最近编辑时间保留一份。

## 地图与内容

世界地图可切换主要旅行城市与省州级行政区，中国地图还可切换地级行政区、景点。旅游资料来自离线数据集，部分地点提供地理定位、周边目的地与延伸阅读。与地点相关的详细历史、路线和实时营业资讯可通过资料卡的来源链接查询。

地图边界与数据覆盖说明见 [数据来源](SOURCES.md)。三张目的地照片来自 Unsplash 图像服务，原图 ID 分别为 photo-1493976040374-85c8e12f0c0e、photo-1502602898657-3e91760cbb34 和 photo-1525625293386-3f8f99389edd。

修改网页或地图数据后，从项目根目录运行 `python3 tools/update_cache.py`，随其他更改一起提交更新后的 sw.js，让已安装的设备获取新版。
