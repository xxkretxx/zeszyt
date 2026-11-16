import Foundation
import ActivityKit

/// Shared between the app (starts/ends activities) and the widget extension (draws them).
struct ZeszytAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var title: String
        var subtitle: String
        var emoji: String
        var kind: String      // "lesson" | "break" | "focus"
        var start: Date
        var end: Date
        var next: String
    }
    var key: String
}
