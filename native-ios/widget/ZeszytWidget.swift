import WidgetKit
import SwiftUI
import ActivityKit

@main
struct ZeszytWidgetBundle: WidgetBundle {
    var body: some Widget {
        ZeszytLiveActivity()
    }
}

private let accent = Color(red: 0.18, green: 0.42, blue: 1.0)

struct TimerText: View {
    let s: ZeszytAttributes.ContentState
    var body: some View {
        Text(timerInterval: s.start...s.end, countsDown: true)
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
    }
}

struct Bar: View {
    let s: ZeszytAttributes.ContentState
    var body: some View {
        ProgressView(timerInterval: s.start...s.end, countsDown: false) {
            EmptyView()
        } currentValueLabel: {
            EmptyView()
        }
        .tint(s.kind == "focus" ? .orange : accent)
    }
}

struct LockView: View {
    let s: ZeszytAttributes.ContentState
    let stale: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Text(s.emoji).font(.system(size: 32))
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.title).font(.headline).foregroundStyle(.white).lineLimit(1)
                    Text(s.subtitle).font(.subheadline).foregroundStyle(.white.opacity(0.65)).lineLimit(1)
                }
                Spacer(minLength: 8)
                if stale {
                    Text("Koniec").font(.title3.weight(.bold)).foregroundStyle(.white)
                } else {
                    TimerText(s: s)
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 100, alignment: .trailing)
                }
            }
            Bar(s: s)
            if !s.next.isEmpty {
                Text(s.next).font(.caption).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
            }
        }
        .padding(16)
    }
}

struct ZeszytLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ZeszytAttributes.self) { context in
            LockView(s: context.state, stale: context.isStale)
                .activityBackgroundTint(Color.black.opacity(0.85))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.state.emoji).font(.title)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    TimerText(s: context.state).font(.title2.weight(.bold)).frame(width: 90, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.title).font(.headline).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(context.state.subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        Bar(s: context.state)
                        if !context.state.next.isEmpty {
                            Text(context.state.next).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                }
            } compactLeading: {
                Text(context.state.emoji)
            } compactTrailing: {
                TimerText(s: context.state).frame(maxWidth: 52).font(.caption.weight(.semibold))
            } minimal: {
                Text(context.state.emoji)
            }
        }
    }
}
