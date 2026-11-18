# 地图与旅行资料

本版地点目录整理于 2026 年 11 月 16 日。去过、想去和手记由使用者自行添加，目录中的推荐目的地不会自动生成旅行记录。

## 底图与行政区

- 世界底图、海外省州边界、城市中心与多语言名称来自 [Natural Earth 1:10m Cultural Vectors](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/)。Natural Earth 将这些数据置于[公有领域](https://www.naturalearthdata.com/about/terms-of-use/)。本应用将坐标转换为等距圆柱投影并简化线段，精度适合旅行浏览。一级区划按 Natural Earth 的行政地理版本展示，部分国家可能已有后续区划调整。部分很小的国家没有可单独显示的省州。
- 中国省级及地级轮廓、行政编码与标记中心使用阿里云 [DataV GeoAtlas](https://datav.aliyun.com/portal/school/atlas/area_selector) 的[省级集合](https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json)及各省级文件。保留 34 个省级区域。地级图层有 333 个地级行政区及北京、天津、上海、重庆四个直辖市入口。沿用快照中的行政区名称和边界，县、区、省直管县级市等不单列。
- 全球 1,096 个城市标记选取国家或地区首府、大城市、地图骨干城市并补充部分历史名城和旅行目的地。中国内地城市由地级图层承载。省级目的地和同名城市可分别记录。地图轮廓用于旅行标记，不用于导航或行政界线认定。

## 旅行介绍与景点

- 主要城市另有本项目编写的中文路线提示。部分地点的简介、景点名称和坐标节选或改编自[中文维基导游](https://zh.wikivoyage.org/)的 [2026 年 11 月数据转储](https://dumps.wikimedia.org/zhwikivoyage/20261101/)，按 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 使用并以相同许可提供这些改编内容。原词条及该页作者可由每条记录中的 `guideUrl` 或 `contextUrl` 到达，点击词条的“查看历史”即可查看贡献者记录。处理包含繁简转换、提取简介与景点条目、缩短文字、按距离匹配和排版。
- 世界遗产名称、类别、入选年份、代表坐标及中国部分遗产简介来自 UNESCO 的 [World Heritage List（WHC001）](https://data.unesco.org/explore/dataset/whc001/) 和[世界遗产中心](https://whc.unesco.org/en/list/)，按 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 使用。经过字段选取、节录、名称整理与距离计算的这些内容沿用相同许可。跨区域或系列遗产可以有多个遗产点；地图标记只代表其中一处，附近景点按与各组成点的大致直线距离计算。
- 中国景点图层含 61 项世界遗产和 354 个来自维基导游的景点标记。遗产项目与导游中的单体景点有时描述同一个建筑群的不同范围。名称相近时可打开来源查看具体范围。
- 对没有本地旅行指南的地点，显示所在地、地理纬度带、按可用资料生成的邻近景点，以及部分国家的地理或历史背景。国家背景在文字中明确标出。详情内可继续打开在线百科和旅行指南。离线目录不提供实时票价、预约余量和开放时间。

## 放大后的边界

世界底图使用 Natural Earth 1:10m [国家边界](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/)与[一级区划轮廓](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/)原始矢量。中国地区还使用 DataV 各行政编码对应的独立文件，例如[浙江省](https://geo.datav.aliyun.com/areas_v3/bound/330000.json)和[杭州市](https://geo.datav.aliyun.com/areas_v3/bound/330100.json)。每个区域在独立文件和同一行政区的集合文件之间选取顶点较多的一份，保留该来源中的各个岛屿、多边形与内部环。资料本身的制图比例尺决定了可见细节。

高精度边界保留 2,263,286 个顶点，导出时保留六位小数坐标，小岛和曲折的边界均由数据源提供。30 个按地理位置分组的数据文件合计约 47 MB，地图根据视野按需读取。视野索引还包含 249 个国家或地区的名称及标签坐标。国旗与图例根据国家或地区编码关联；没有正式编码的地理对象使用内部标识。

### 由同一批源数据重新生成

先准备下列文件，放在应用目录之外的一个源数据目录中。

- Natural Earth 三份原始 ZIP 分别保存为 `admin_0_countries.zip`、`admin_1_states_provinces.zip`、`populated_places.zip`。保留压缩包内的原始文件名。
- DataV 全国省级集合保存为 `china.json`，各省地级集合保存为 `cn-省级六位编码.json`。367 份各区划独立文件放在 `cn-detail/六位行政编码.json`。
- 应用目录包含既有的 `atlas.json` 和 `world.json`。安装 Python `pyshp` 后，从应用根目录运行 `python datasets/build_detail.py /绝对路径/源数据目录 .`。脚本更新目录中的国家编码，并重建 `detail/` 中的视野索引和边界分块。

## 自然地理底图

山脉起伏与地表颜色来自 Natural Earth 的 [Cross-blended Hypsometric Tints with Shaded Relief](https://www.naturalearthdata.com/downloads/10m-raster-data/10m-cross-blend-hypso/)（1:10m，HYP_LR_SR 3.2.0）。它将地形晕渲与按地势和气候调整的分层设色结合。原始图像为 WGS84 等距圆柱投影、16,200 × 8,100 像素；应用内的世界全图采用 4,096 × 2,048 像素 JPEG。

水系来自 Natural Earth 1:10m 的[河流与湖心线](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-rivers-lake-centerlines/)与[湖泊、水库](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-lakes/) 5.0.0。保留 1,214 个河流或运河要素与 1,355 个湖泊、水库等水面要素，按原始制图等级供不同缩放级别选择。湖心线是用于连接河网的辅助线，地图在湖面内省略这些线条。两类底图均来自 [Natural Earth 公有领域资料](https://www.naturalearthdata.com/about/terms-of-use/)。

中国视图另截取东经 72° 至 136°、北纬 15° 至 55° 的原分辨率地形（2,880 × 1,800 像素），覆盖上述范围内的大陆、台湾及附近岛屿。范围外使用世界全图。两幅影像取自同一份地形数据。

## 街道与旅行记录图层

应用按当前视野从 [OpenFreeMap](https://openfreemap.org/) 加载 [OpenMapTiles](https://openmaptiles.org/) 格式的 [OpenStreetMap](https://www.openstreetmap.org/copyright) 矢量图块，用于街道、建筑、公园、水体与道路名称。放大超过源图块分辨率后继续绘制同一批矢量要素。服务请求包含图块坐标。个人手记、日期和去过或想去的标记保存在原有旅行册中。

国家及地区目录将 Natural Earth 国界按地区编码合并，保留同一目的地下已有地点记录的索引。台湾图层含 22 个县市和 64 个主要景点。县市边界来自[国土测绘中心行政区界线](https://data.gov.tw/dataset/7442)，参照 2025 年县市边界。景点名称、坐标与部分介绍来自[交通部观光署观光资讯资料库](https://data.gov.tw/dataset/7777)。县市与景点资料按[政府资料开放授权条款第 1 版](https://data.gov.tw/license)使用，已简化边界、转换文字并整理旅行提示。

海南省直辖县级行政区、香港十八区和澳门八个区域的多边形来自[阿里云 DataV 行政区划边界](https://datav.aliyun.com/portal/school/atlas/area_selector)。地铁与轻轨线路、颜色和车站来自 [OpenStreetMap Subway Validator](https://maps.mail.ru/osm/tools/subways/latest/) 2026-11-16 的全球网络快照。几何和颜色均由 OpenStreetMap 贡献者维护，遵循 [ODbL](https://www.openstreetmap.org/copyright)。线路无配色时使用中性灰。数据按视野分块读取，普通铁路使用独立开关。


## 卫星地球与目的地旅行提示

球形地图由 MapLibre GL JS 6.19.0 渲染，按 BSD 3-Clause 授权使用，完整许可证见 maplibre-LICENSE.txt。卫星影像来自 Esri World Imagery，署名包括 Esri、Vantor、Earthstar Geographics 和 GIS User Community。影像随视野按需加载，分辨率与拍摄日期随区域不同。

travel-tips.json 包含 148 条目的地提示。中文维基导游的改写内容保留每篇文章的修订链接，遵循 CC BY-SA 4.0 授权；遗产景点另附 UNESCO 世界遗产中心资料链接。应用以本文件中的专属提示替换对应旧文本，并隐藏高频重复的默认旅行提示。尚无专属提示的地点保留旅行指南入口。海南及港澳的县区边界已改用 DataV 各行政区单独文件中的精细坐标。
