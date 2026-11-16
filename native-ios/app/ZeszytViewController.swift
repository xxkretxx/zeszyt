import UIKit
import Capacitor

/// Registers the app's own native plugins with the Capacitor bridge.
class ZeszytViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveActivityPlugin())
    }
}
