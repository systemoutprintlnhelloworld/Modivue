import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

guard CommandLine.arguments.count == 3 else { fatalError("需要 PNG 源图和 ICNS 输出路径") }
guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL, nil),
    let sourceImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    fatalError("无法读取图标源图")
}
let colorSpace = CGColorSpaceCreateDeviceRGB()

func appendBigEndian(_ value: UInt32, to data: inout Data) {
    var encoded = value.bigEndian
    withUnsafeBytes(of: &encoded) { data.append(contentsOf: $0) }
}

func pngData(pixels: Int) -> Data {
    guard let context = CGContext(data: nil, width: pixels, height: pixels, bitsPerComponent: 8,
        bytesPerRow: pixels * 4, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        fatalError("无法创建图标画布")
    }
    context.interpolationQuality = .high
    context.draw(sourceImage, in: CGRect(x: 0, y: 0, width: pixels, height: pixels))
    guard let image = context.makeImage() else { fatalError("无法生成图标图像") }
    let encoded = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(encoded, UTType.png.identifier as CFString, 1, nil) else {
        fatalError("无法创建 PNG 编码器")
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { fatalError("PNG 编码失败") }
    return encoded as Data
}

var body = Data()
for (type, pixels) in [("icp4", 16), ("icp5", 32), ("icp6", 64), ("ic07", 128), ("ic08", 256), ("ic09", 512), ("ic10", 1024)] {
    let png = pngData(pixels: pixels)
    body.append(contentsOf: type.utf8)
    appendBigEndian(UInt32(png.count + 8), to: &body)
    body.append(png)
}

var icon = Data("icns".utf8)
appendBigEndian(UInt32(body.count + 8), to: &icon)
icon.append(body)
try icon.write(to: URL(fileURLWithPath: CommandLine.arguments[2]), options: .atomic)
