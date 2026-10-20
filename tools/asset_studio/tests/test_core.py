"""核心算法测试：python -m unittest asset_studio.tests.test_core（cwd=tools）。"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from asset_studio import imaging
from asset_studio import config as cfgmod
from asset_studio.providers import MockProvider
from asset_studio.pipeline import Pipeline


class TestImaging(unittest.TestCase):
    def test_remove_background(self):
        im = Image.new("RGBA", (200, 200), (240, 240, 240, 255))
        d = ImageDraw.Draw(im)
        d.rectangle([70, 70, 130, 130], fill=(180, 60, 60, 255))
        out = imaging.remove_background(im, tolerance=20, feather=0)
        self.assertEqual(out.getpixel((0, 0))[3], 0)
        self.assertEqual(out.getpixel((100, 100))[3], 255)

    def test_alpha_components(self):
        im = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rectangle([20, 20, 60, 60], fill=(255, 0, 0, 255))
        d.rectangle([160, 160, 220, 220], fill=(0, 255, 0, 255))
        boxes = imaging.alpha_components(im, min_area=20, sample=256)
        self.assertEqual(len(boxes), 2)
        self.assertLess(boxes[0][0], boxes[1][0])

    def test_slice_grid_3x3(self):
        im = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        for r in range(3):
            for c in range(3):
                d.rectangle([c * 100 + 10, r * 100 + 10, c * 100 + 90, r * 100 + 90],
                            fill=(r * 80, c * 80, 120, 255))
        parts = imaging.slice_grid(im, 3, 3)
        self.assertEqual(len(parts), 9)

    def test_pack_atlas(self):
        imgs = [("a", Image.new("RGBA", (40, 30), (255, 0, 0, 255))),
                ("b", Image.new("RGBA", (20, 50), (0, 255, 0, 255)))]
        atlas, frames = imaging.pack_atlas(imgs, max_size=256, padding=2)
        self.assertEqual(len(frames), 2)
        for f in frames:
            self.assertLessEqual(f["x"] + f["w"], atlas.width)
            self.assertLessEqual(f["y"] + f["h"], atlas.height)

    def test_write_atlas_manifest(self):
        with tempfile.TemporaryDirectory() as td:
            imgs = [("icon_a", Image.new("RGBA", (32, 32), (255, 0, 0, 255)))]
            res = imaging.write_atlas(Path(td), imgs, name="t")
            self.assertTrue(res["atlas"].exists())
            data = json.loads(Path(res["manifest"]).read_text(encoding="utf-8"))
            self.assertIn("icon_a", data["frames"])
            self.assertEqual(data["frames"]["icon_a"]["insets"], [12, 12, 12, 12])


class TestProvidersAndPipeline(unittest.TestCase):
    def test_mock_provider(self):
        p = MockProvider()
        imgs = p.generate("test", "", 256, 2)
        self.assertEqual(len(imgs), 2)
        self.assertEqual(imgs[0].size, (256, 256))

    def test_pipeline_roundtrip(self):
        with tempfile.TemporaryDirectory() as td:
            cfg = dict(cfgmod.DEFAULTS)
            cfg.update({"provider": "mock", "output_dir": td, "size": 256, "count": 1})
            pipe = Pipeline(cfg)
            gen = pipe.generate("icon", "", 256, 1)
            self.assertEqual(len(gen), 1)
            matte = pipe.matte(gen[0])
            self.assertTrue(matte.exists())
            big = pipe.upscale(matte, 2)
            self.assertEqual(Image.open(big).size[0], Image.open(matte).size[0] * 2)
            layers = pipe.layers(matte, min_area=20)
            self.assertTrue(layers, "mock 图应至少拆出一层")
            res = pipe.export_atlas(layers, name="atlas")
            self.assertTrue(res["atlas"].exists())


if __name__ == "__main__":
    unittest.main()
