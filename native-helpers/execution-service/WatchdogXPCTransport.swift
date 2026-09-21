import Foundation
import XPC

private let watchdogXPCFixtureIdentifier = "com.socialeap.dosai.watchdog-xpc-fixture"
private let watchdogXPCFrameLimit = 4_096
private let watchdogXPCRequestKeys: Set<String> = [
    "schema_id", "schema_version", "request_id", "session_id", "service_boot_id",
    "service_generation", "sequence", "operation", "supervisor_generation",
    "capsule_id", "reason", "authorization",
]
private let watchdogXPCResponseKeys: Set<String> = [
    "schema_id", "schema_version", "response_id", "request_id", "session_id",
    "service_boot_id", "service_generation", "sequence", "operation", "result",
]

enum WatchdogXPCPeerOutcome: String {
    case authenticated = "AUTHENTICATED"
    case identityRejected = "PEER_IDENTITY_REJECTED"
    case invalidTeamIdentifier = "INVALID_TEAM_IDENTIFIER"
    case requirementConfigurationFailed = "REQUIREMENT_CONFIGURATION_FAILED"
    case responseRejected = "RESPONSE_REJECTED"
    case disconnectReductionFailed = "DISCONNECT_REDUCTION_FAILED"
    case timedOut = "TIMED_OUT"
}

private enum WatchdogXPCFrameError: Error {
    case invalid
    case oversized
}

enum WatchdogXPCServiceEventOutcome {
    case replied
    case disconnected
    case rejected
}

private func xpcString(_ dictionary: XPCDictionary, _ key: String) throws -> String {
    guard let value: String = dictionary[key] else { throw WatchdogXPCFrameError.invalid }
    return value
}

private func decodeWatchdogXPCRequest(_ message: xpc_object_t) throws -> [String: Any] {
    guard xpc_get_type(message) == XPC_TYPE_DICTIONARY else {
        throw WatchdogXPCFrameError.invalid
    }
    let dictionary = XPCDictionary(message)
    guard let schemaVersion: Int64 = dictionary["schema_version"],
          schemaVersion == 1
    else {
        throw WatchdogXPCFrameError.invalid
    }
    let operation = try xpcString(dictionary, "operation")
    let expectedKeys: Set<String>
    switch operation {
    case "INSPECT":
        expectedKeys = watchdogXPCRequestKeys.subtracting(["capsule_id", "reason"])
    case "STOP_ONE":
        expectedKeys = watchdogXPCRequestKeys
    case "STOP_ALL":
        expectedKeys = watchdogXPCRequestKeys.subtracting(["capsule_id"])
    default:
        throw WatchdogXPCFrameError.invalid
    }
    guard Set(dictionary.keys) == expectedKeys else { throw WatchdogXPCFrameError.invalid }

    var request: [String: Any] = [
        "schema_id": try xpcString(dictionary, "schema_id"),
        "schema_version": Int(schemaVersion),
        "request_id": try xpcString(dictionary, "request_id"),
        "session_id": try xpcString(dictionary, "session_id"),
        "service_boot_id": try xpcString(dictionary, "service_boot_id"),
        "service_generation": try xpcString(dictionary, "service_generation"),
        "sequence": try xpcString(dictionary, "sequence"),
        "operation": operation,
        "supervisor_generation": try xpcString(dictionary, "supervisor_generation"),
        "authorization": try xpcString(dictionary, "authorization"),
    ]
    if operation == "STOP_ONE" {
        request["capsule_id"] = try xpcString(dictionary, "capsule_id")
    }
    if operation != "INSPECT" {
        request["reason"] = try xpcString(dictionary, "reason")
    }
    let data = try JSONSerialization.data(withJSONObject: request, options: [.sortedKeys])
    guard data.count <= watchdogXPCFrameLimit else { throw WatchdogXPCFrameError.oversized }
    return request
}

private func makeStopOneRequest() -> xpc_object_t {
    let request = xpc_dictionary_create(nil, nil, 0)
    xpc_dictionary_set_string(request, "schema_id", InertWatchdogControlCore.schemaID)
    xpc_dictionary_set_int64(request, "schema_version", 1)
    xpc_dictionary_set_string(request, "request_id", "77777777-7777-4777-8777-777777777777")
    xpc_dictionary_set_string(request, "session_id", InertWatchdogControlCore.sessionID)
    xpc_dictionary_set_string(request, "service_boot_id", InertWatchdogControlCore.serviceBootID)
    xpc_dictionary_set_string(request, "service_generation", InertWatchdogControlCore.serviceGeneration)
    xpc_dictionary_set_string(request, "sequence", "1")
    xpc_dictionary_set_string(request, "operation", WatchdogOperation.stopOne.rawValue)
    xpc_dictionary_set_string(request, "supervisor_generation", InertWatchdogControlCore.supervisorGeneration)
    xpc_dictionary_set_string(request, "capsule_id", "44444444-4444-4444-8444-444444444441")
    xpc_dictionary_set_string(request, "reason", "OWNER_REQUEST")
    xpc_dictionary_set_string(request, "authorization", "NO_EFFECT_TEST_ONLY")
    return request
}

private func makeStopResult(
    for message: xpc_object_t,
    request: [String: Any],
    completion: WatchdogCompletion
) -> xpc_object_t? {
    guard let reply = xpc_dictionary_create_reply(message),
          let requestID = request["request_id"] as? String,
          let sessionID = request["session_id"] as? String,
          let serviceBootID = request["service_boot_id"] as? String,
          let serviceGeneration = request["service_generation"] as? String,
          let sequence = request["sequence"] as? String,
          let operation = request["operation"] as? String
    else { return nil }
    xpc_dictionary_set_string(reply, "schema_id", "urn:dosai:schema:watchdog-control-response:1")
    xpc_dictionary_set_int64(reply, "schema_version", 1)
    xpc_dictionary_set_string(reply, "response_id", completion.responseID)
    xpc_dictionary_set_string(reply, "request_id", requestID)
    xpc_dictionary_set_string(reply, "session_id", sessionID)
    xpc_dictionary_set_string(reply, "service_boot_id", serviceBootID)
    xpc_dictionary_set_string(reply, "service_generation", serviceGeneration)
    xpc_dictionary_set_string(reply, "sequence", sequence)
    xpc_dictionary_set_string(reply, "operation", operation)

    let result = xpc_dictionary_create(nil, nil, 0)
    xpc_dictionary_set_string(result, "kind", "STOP_RESULT")
    xpc_dictionary_set_string(result, "scope", completion.operation == .stopOne ? "ONE" : "ALL")
    xpc_dictionary_set_string(result, "disposition", completion.disposition)
    let capsuleIDs = xpc_array_create(nil, 0)
    for capsuleID in completion.capsuleIDs {
        xpc_array_set_string(capsuleIDs, XPC_ARRAY_APPEND, capsuleID)
    }
    xpc_dictionary_set_value(result, "capsule_ids", capsuleIDs)
    xpc_dictionary_set_value(reply, "result", result)
    return reply
}

@discardableResult
func routeWatchdogXPCServiceEvent(
    _ message: xpc_object_t,
    from peer: xpc_connection_t,
    through core: InertWatchdogControlCore
) -> WatchdogXPCServiceEventOutcome {
    if xpc_get_type(message) == XPC_TYPE_ERROR {
        core.disconnect()
        _ = core.drainNext()
        return .disconnected
    }
    do {
        let request = try decodeWatchdogXPCRequest(message)
        guard case .queued = core.submit(request),
              let completion = core.drainNext(),
              let reply = makeStopResult(for: message, request: request, completion: completion)
        else {
            xpc_connection_cancel(peer)
            return .rejected
        }
        xpc_connection_send_message(peer, reply)
        return .replied
    } catch {
        xpc_connection_cancel(peer)
        return .rejected
    }
}

private func validStopOneResponse(_ reply: xpc_object_t) -> Bool {
    guard xpc_get_type(reply) == XPC_TYPE_DICTIONARY else { return false }
    let response = XPCDictionary(reply)
    guard Set(response.keys) == watchdogXPCResponseKeys,
          let schemaVersion: Int64 = response["schema_version"],
          schemaVersion == 1,
          let schemaID: String = response["schema_id"],
          schemaID == "urn:dosai:schema:watchdog-control-response:1",
          let responseID: String = response["response_id"],
          responseID == "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
          let requestID: String = response["request_id"],
          requestID == "77777777-7777-4777-8777-777777777777",
          let sessionID: String = response["session_id"],
          sessionID == InertWatchdogControlCore.sessionID,
          let serviceBootID: String = response["service_boot_id"],
          serviceBootID == InertWatchdogControlCore.serviceBootID,
          let serviceGeneration: String = response["service_generation"],
          serviceGeneration == InertWatchdogControlCore.serviceGeneration,
          let sequence: String = response["sequence"],
          sequence == "1",
          let operation: String = response["operation"],
          operation == "STOP_ONE",
          let result: XPCDictionary = response["result"],
          Set(result.keys) == ["kind", "scope", "disposition", "capsule_ids"],
          let kind: String = result["kind"],
          kind == "STOP_RESULT",
          let scope: String = result["scope"],
          scope == "ONE",
          let disposition: String = result["disposition"],
          disposition == "STOPPED",
          let resultObject = xpc_dictionary_get_value(reply, "result"),
          let capsuleIDs = xpc_dictionary_get_value(resultObject, "capsule_ids"),
          xpc_get_type(capsuleIDs) == XPC_TYPE_ARRAY,
          xpc_array_get_count(capsuleIDs) == 1,
          let capsuleID = xpc_array_get_string(capsuleIDs, 0),
          String(cString: capsuleID) == "44444444-4444-4444-8444-444444444441"
    else { return false }
    return true
}

private func validTeamIdentifier(_ value: String) -> Bool {
    value.count == 10 && value.allSatisfy { character in
        character.isASCII && (character.isNumber || ("A"..."Z").contains(String(character)))
    }
}

private func exactPeerRequirement(teamIdentifier: String) -> String {
    "anchor apple generic and certificate leaf[subject.OU] = \"\(teamIdentifier)\" and identifier \"\(watchdogXPCFixtureIdentifier)\""
}

func runWatchdogXPCPeerSelfTest(teamIdentifier: String) -> [String: Any] {
    guard validTeamIdentifier(teamIdentifier) else {
        return watchdogXPCPeerReport(.invalidTeamIdentifier, requirementConfigured: false)
    }
    let requirement = exactPeerRequirement(teamIdentifier: teamIdentifier)
    let serviceQueue = DispatchQueue(label: "com.socialeap.dosai.watchdog-xpc-fixture.service")
    let clientQueue = DispatchQueue(label: "com.socialeap.dosai.watchdog-xpc-fixture.client")
    let replyReceived = DispatchSemaphore(value: 0)
    let disconnectObserved = DispatchSemaphore(value: 0)
    let core = InertWatchdogControlCore()
    var replyOutcome = WatchdogXPCPeerOutcome.responseRejected

    let listener = xpc_connection_create(nil, serviceQueue)
    guard xpc_connection_set_peer_code_signing_requirement(listener, requirement) == 0 else {
        return watchdogXPCPeerReport(.requirementConfigurationFailed, requirementConfigured: false)
    }
    xpc_connection_set_event_handler(listener) { event in
        guard xpc_get_type(event) == XPC_TYPE_CONNECTION else { return }
        let peer = event
        xpc_connection_set_event_handler(peer) { message in
            switch routeWatchdogXPCServiceEvent(message, from: peer, through: core) {
            case .disconnected:
                disconnectObserved.signal()
            case .replied, .rejected:
                break
            }
        }
        xpc_connection_activate(peer)
    }
    xpc_connection_activate(listener)

    let endpoint = xpc_endpoint_create(listener)
    let client = xpc_connection_create_from_endpoint(endpoint)
    guard xpc_connection_set_peer_code_signing_requirement(client, requirement) == 0 else {
        xpc_connection_cancel(listener)
        return watchdogXPCPeerReport(.requirementConfigurationFailed, requirementConfigured: false)
    }
    xpc_connection_set_event_handler(client) { _ in }
    xpc_connection_activate(client)
    xpc_connection_send_message_with_reply(client, makeStopOneRequest(), clientQueue) { reply in
        if reply === XPC_ERROR_PEER_CODE_SIGNING_REQUIREMENT
            || reply === XPC_ERROR_CONNECTION_INTERRUPTED
            || reply === XPC_ERROR_CONNECTION_INVALID {
            replyOutcome = .identityRejected
        } else if validStopOneResponse(reply) {
            replyOutcome = .authenticated
        }
        replyReceived.signal()
    }

    if replyReceived.wait(timeout: .now() + .milliseconds(1_000)) == .timedOut {
        replyOutcome = .timedOut
    }
    xpc_connection_cancel(client)
    if replyOutcome == .authenticated {
        if disconnectObserved.wait(timeout: .now() + .milliseconds(1_000)) == .timedOut {
            replyOutcome = .disconnectReductionFailed
        } else {
            let reduced = serviceQueue.sync { core.capsules.allSatisfy { $0.state.isTerminal } }
            if !reduced { replyOutcome = .disconnectReductionFailed }
        }
    }
    xpc_connection_cancel(listener)
    return watchdogXPCPeerReport(replyOutcome, requirementConfigured: true)
}

private func watchdogXPCPeerReport(
    _ outcome: WatchdogXPCPeerOutcome,
    requirementConfigured: Bool
) -> [String: Any] {
    [
        "schema": "DOSAI_WATCHDOG_XPC_FIXTURE_V1",
        "ok": outcome == .authenticated,
        "result": [
            "ad_hoc_authentication_eligible": false,
            "application_reachable": false,
            "authenticated_peer_observed": outcome == .authenticated,
            "filesystem_authority": false,
            "mach_service_registered": false,
            "network_authority": false,
            "outcome": outcome.rawValue,
            "peer_requirement_api": "xpc_connection_set_peer_code_signing_requirement",
            "process_launch_authority": false,
            "requirement_configured_on_both_connections": requirementConfigured,
            "synthetic_trust_installed": false,
            "virtual_machine_authority": false,
        ],
    ]
}

func watchdogXPCAdmissionSelfTest() -> [String: Any] {
    let validMessage = makeStopOneRequest()
    let validRequest = try? decodeWatchdogXPCRequest(validMessage)
    let core = InertWatchdogControlCore()
    let routed = validRequest.map { core.submit($0) }
    let completion = core.drainNext()

    let unknownField = makeStopOneRequest()
    xpc_dictionary_set_string(unknownField, "path", "/tmp/not-admitted")
    let unknownRejected = (try? decodeWatchdogXPCRequest(unknownField)) == nil

    let wrongType = makeStopOneRequest()
    xpc_dictionary_set_int64(wrongType, "authorization", 1)
    let wrongTypeRejected = (try? decodeWatchdogXPCRequest(wrongType)) == nil

    let oversized = makeStopOneRequest()
    xpc_dictionary_set_string(oversized, "authorization", String(repeating: "A", count: 4_096))
    let oversizedRejected = (try? decodeWatchdogXPCRequest(oversized)) == nil

    let checks: [String: Bool] = [
        "accepted_frame_routed_to_inert_core": {
            guard case .queued? = routed else { return false }
            return completion?.operation == .stopOne && completion?.disposition == "STOPPED"
        }(),
        "frame_limit_enforced": oversizedRejected,
        "unknown_field_rejected": unknownRejected,
        "wrong_xpc_type_rejected": wrongTypeRejected,
    ]
    return [
        "schema": "DOSAI_WATCHDOG_XPC_FIXTURE_V1",
        "ok": checks.values.allSatisfy { $0 },
        "result": [
            "checks": checks,
            "external_mutation_performed": false,
            "peer_authentication_claimed": false,
            "transport": "ANONYMOUS_IN_PROCESS_XPC",
        ],
    ]
}
