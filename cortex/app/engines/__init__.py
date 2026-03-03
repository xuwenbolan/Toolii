from __future__ import annotations

from app.engines.base import BaseEngine
from app.engines.birefnet import BiRefNetEngine
from app.engines.ddcolor import DDColorEngine
from app.engines.gfpgan import GFPGANEngine
from app.engines.lama import LaMaEngine
from app.engines.migan import MIGANEngine
from app.engines.mobilesam import MobileSAMEngine
from app.engines.nafnet import NAFNetEngine
from app.engines.rapidocr import RapidOCREngine
from app.engines.realesrgan import RealESRGANEngine

ALL_ENGINES: list[BaseEngine] = [
    BiRefNetEngine(),
    RealESRGANEngine(),
    GFPGANEngine(),
    NAFNetEngine(),
    DDColorEngine(),
    LaMaEngine(),
    MIGANEngine(),
    RapidOCREngine(),
    MobileSAMEngine(),
]
