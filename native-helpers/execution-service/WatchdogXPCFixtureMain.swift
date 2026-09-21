import Foundation

private func watchdogXPCDescription() -> [String: Any] {
    [
        "schema": "DOSAI_WATCHDOG_XPC_FIXTURE_V1",
        "ok": true,
        "result": [
            "ad_hoc_authentication_eligible": false,
            "application_reachable": false,
            "filesystem_authority": false,
            "helper_id": "com.socialeap.dosai.watchdog-xpc-fixture",
            "journal_authority": false,
            "mach_service_registered": false,
            "minimum_macos_version": "15.0",
            "network_authority": false,
            "operations": ["describe", "self-test", "peer-auth-self-test"],
            "peer_requirement_api": "xpc_connection_set_peer_code_signing_requirement",
            "process_launch_authority": false,
            "production_registration_authority": false,
            "protocol_version": 1,
            "service_management_imported": false,
            "stdin_consumed": false,
            "transport": "ANONYMOUS_IN_PROCESS_XPC",
            "virtual_machine_authority": false,
        ],
    ]
}

private func writeWatchdogXPCJSON(_ value: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0a]))
}

private func protocolFailure() -> Never {
    writeWatchdogXPCJSON([
        "schema": "DOSAI_WATCHDOG_XPC_FIXTURE_V1",
        "ok": false,
        "error": ["code": "DOSAI_WATCHDOG_XPC_FIXTURE_PROTOCOL_0001"],
    ])
    exit(64)
}

@main
enum WatchdogXPCFixture {
    static func main() {
        let arguments = CommandLine.arguments
        if arguments.count == 2 {
            switch arguments[1] {
            case "describe":
                writeWatchdogXPCJSON(watchdogXPCDescription())
            case "self-test":
                let report = watchdogXPCAdmissionSelfTest()
                writeWatchdogXPCJSON(report)
                if report["ok"] as? Bool != true { exit(1) }
            default:
                protocolFailure()
            }
            return
        }
        if arguments.count == 3 && arguments[1] == "peer-auth-self-test" {
            let report = runWatchdogXPCPeerSelfTest(teamIdentifier: arguments[2])
            writeWatchdogXPCJSON(report)
            if report["ok"] as? Bool != true { exit(77) }
            return
        }
        protocolFailure()
    }
}
