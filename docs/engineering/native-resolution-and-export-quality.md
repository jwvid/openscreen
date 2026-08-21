# Native capture resolution and export quality

## macOS capture

The ScreenCaptureKit helper resolves display capture dimensions from the active
`CGDisplayMode.pixelWidth` and `pixelHeight`. Do not use
`CGDisplayPixelsWide`/`CGDisplayPixelsHigh` as the primary source: on Retina and
virtual displays they can return the logical “looks like” size instead of the
actual framebuffer size.

The renderer sends `video.width = 0` and `video.height = 0` for native macOS
recording. Zero is the protocol value for “do not cap the source dimensions.” A
positive value remains a hard upper bound for callers that need one.

The helper calculates recording bitrate after resolving the source dimensions.
It uses 0.16 bits per pixel per frame, bounded to 24–240 Mbps. H.264 is used up
to DCI 4K dimensions; larger Retina, 5K, and 6K frames use HEVC so dimensions do
not need to be reduced for the encoder.

## MP4 export

The three export presets are:

- 1080p (`medium` internally): 35 Mbps;
- 4K (`good` internally and the default): 100 Mbps;
- Original (`source` internally): 40–200 Mbps based on the source short side.

Output dimensions remain even-valued for video codec compatibility. The 4K
preset fixes the short side at 2160 pixels, so non-16:9 projects may be slightly
wider or taller than 3840×2160 while preserving the selected aspect ratio.
Exports up to DCI 4K use H.264 High Level 5.2. Larger original-resolution
exports use HEVC Main High Tier Level 5.2.
