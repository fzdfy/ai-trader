"""数据源集合。

每个源独立一个子文件夹（mootdx / tencent / baidu / sina），各自实现
`MarketProvider` 统一接口。此处仅做汇总导出，registry 负责实例化与选择。

增删平台：新建子文件夹实现 provider、在此 import + `__all__` 导出，
再在 `registry.py` 登记即可。
"""
from .baidu import BaiduProvider
from .eastmoney import EastmoneyProvider
from .mootdx import MootdxProvider
from .sina import SinaProvider
from .tencent import TencentProvider
from .ths import ThsProvider

__all__ = [
    "MootdxProvider",
    "TencentProvider",
    "BaiduProvider",
    "SinaProvider",
    "ThsProvider",
    "EastmoneyProvider",
]
