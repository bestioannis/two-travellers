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
