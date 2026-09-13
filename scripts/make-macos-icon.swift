import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

guard CommandLine.arguments.count == 2 else { fatalError("需要 ICNS 输出路径") }
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
    let unit = CGFloat(pixels) / 1024
    let background = CGGradient(colorsSpace: colorSpace, colors: [
        CGColor(red: 0.018, green: 0.047, blue: 0.102, alpha: 1),
        CGColor(red: 0.035, green: 0.106, blue: 0.188, alpha: 1)
    ] as CFArray, locations: [0, 1])!
    context.drawLinearGradient(background, start: CGPoint(x: 0, y: pixels), end: CGPoint(x: pixels, y: 0), options: [])
    context.setLineCap(.round)
    context.setLineJoin(.round)
    context.setLineWidth(58 * unit)
    let center = CGPoint(x: 512 * unit, y: 512 * unit)
    let radius = 298 * unit
    for (start, end, color) in [
        (-82.0, 26.0, CGColor(red: 0.125, green: 0.839, blue: 0.710, alpha: 1)),
        (38.0, 146.0, CGColor(red: 0.294, green: 0.639, blue: 1, alpha: 1)),
        (158.0, 266.0, CGColor(red: 0.722, green: 0.518, blue: 1, alpha: 1))
    ] {
        context.setStrokeColor(color)
        context.addArc(center: center, radius: radius, startAngle: start * .pi / 180, endAngle: end * .pi / 180, clockwise: false)
        context.strokePath()
    }
    context.setLineWidth(62 * unit)
    context.setStrokeColor(CGColor(red: 0.855, green: 0.957, blue: 1, alpha: 1))
    context.move(to: CGPoint(x: 348 * unit, y: 382 * unit))
    context.addLine(to: CGPoint(x: 348 * unit, y: 642 * unit))
    context.addLine(to: CGPoint(x: 512 * unit, y: 492 * unit))
    context.addLine(to: CGPoint(x: 676 * unit, y: 642 * unit))
    context.addLine(to: CGPoint(x: 676 * unit, y: 382 * unit))
    context.strokePath()
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
try icon.write(to: URL(fileURLWithPath: CommandLine.arguments[1]), options: .atomic)
