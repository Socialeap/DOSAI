import XPC

enum WatchdogNamedListenerTransportCandidate {
    static func makeActivatedListener() throws -> xpc_connection_t {
        let core = InertWatchdogControlCore()
        let listener = try WatchdogNamedListenerCandidate.makeInactiveListener()
        xpc_connection_set_event_handler(listener) { event in
            guard xpc_get_type(event) == XPC_TYPE_CONNECTION else {
                xpc_connection_cancel(listener)
                return
            }
            let peer = event
            xpc_connection_set_event_handler(peer) { message in
                routeWatchdogXPCServiceEvent(message, from: peer, through: core)
            }
            xpc_connection_activate(peer)
        }
        xpc_connection_activate(listener)
        return listener
    }
}
