"""Eclipsed Asset Studio —— 本地游戏资产可视化管线。

模块：
- config    : 本地配置（API Key、输出目录、默认参数）
- providers : 生成后端（Mock / DashScope / OpenAI 兼容）
- imaging   : 抠图、拆层、切图、Atlas 等图像算法
- pipeline  : 串起「生成 → 后处理 → 交付」的流程
- app       : Tkinter 桌面界面
"""

__version__ = "0.1.0"
