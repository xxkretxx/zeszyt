import Foundation
import Capacitor
import ActivityKit

/// JS: registerPlugin('LiveActivity') → start({...}) / end() / available()
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
    ]

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["value": ActivityAuthorizationInfo().areActivitiesEnabled])
    }

    @objc func start(_ call: CAPPluginCall) {
        let key = call.getString("key") ?? ""
        var start = Date(timeIntervalSince1970: (call.getDouble("start") ?? 0) / 1000)
        let end = Date(timeIntervalSince1970: (call.getDouble("end") ?? 0) / 1000)
        if end <= start { start = end.addingTimeInterval(-1) } // ClosedRange must be valid
        let state = ZeszytAttributes.ContentState(
            title: call.getString("title") ?? "",
            subtitle: call.getString("subtitle") ?? "",
            emoji: call.getString("emoji") ?? "📘",
            kind: call.getString("kind") ?? "lesson",
            start: start,
            end: end,
            next: call.getString("next") ?? ""
        )
        let content = ActivityContent(state: state, staleDate: end)
        Task {
            if let current = Activity<ZeszytAttributes>.activities.first(where: { $0.attributes.key == key }) {
                await current.update(content)
                call.resolve(["ok": true])
                return
            }
            for a in Activity<ZeszytAttributes>.activities {
                await a.end(nil, dismissalPolicy: .immediate)
            }
            do {
                _ = try Activity.request(attributes: ZeszytAttributes(key: key), content: content, pushType: nil)
                call.resolve(["ok": true])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        Task {
            for a in Activity<ZeszytAttributes>.activities {
                await a.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }
}
