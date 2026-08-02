# BDF Fonts Directory

This directory is for storing local BDF (Bitmap Distribution Format) fonts that can be loaded into your ScreenBee projects.

## How to Add Fonts

1. Place your `.bdf` font files in this directory
2. The fonts will be automatically available in the font loader dialog
3. You can load fonts from the Project Settings dialog under the "Fonts" tab

## Where to Find BDF Fonts

You can find BDF fonts from various sources:

- **u8g2 Font Collection**: https://github.com/olikraus/u8g2/tree/master/tools/font/bdf
- **X11 Fonts**: Many classic X11 bitmap fonts are available in BDF format
- **Custom Fonts**: Create your own BDF fonts using font editors

## BDF Font Format

BDF (Bitmap Distribution Format) is a simple text-based format for storing bitmap fonts. These fonts are ideal for embedded systems and low-resolution displays because they are pre-rendered at specific pixel sizes.

## Example

Simply copy `.bdf` files into this directory and they will appear in the local font loader.

