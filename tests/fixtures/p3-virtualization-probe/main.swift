import Foundation
import Virtualization

private let helperID = "com.socialeap.dosai.virtualization-configuration-probe"
private let helperSchema = "DOSAI_VIRTUALIZATION_CONFIGURATION_PROBE_V1"
private let fixedCPUCount = 1
private let fixedMemorySize: UInt64 = 512 * 1024 * 1024

private func emit(_ payload: [String: Any]) {
  guard
    let data = try? JSONSerialization.data(
      withJSONObject: payload,
      options: [.sortedKeys, .withoutEscapingSlashes]
    )
  else {
    exit(70)
  }
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data([0x0a]))
}

private func describe() -> [String: Any] {
  [
    "helper_id": helperID,
    "minimum_macos_version": "15.0",
    "mutation_performed": false,
    "network_authority": false,
    "operations": ["describe", "inspect-fixed-profile"],
    "process_launch_authority": false,
    "protocol_version": 1,
    "stdin_consumed": false,
    "virtual_machine_created": false,
    "virtual_machine_start_authority": false,
    "virtualization_supported_in_current_process": VZVirtualMachine.isSupported,
  ]
}

private func inspectFixedProfile() -> [String: Any] {
  let configuration = VZVirtualMachineConfiguration()
  configuration.cpuCount = fixedCPUCount
  configuration.memorySize = fixedMemorySize

  return [
    "audio_device_count": configuration.audioDevices.count,
    "boot_artifacts_supplied": false,
    "configuration_is_bootable": false,
    "cpu_count": configuration.cpuCount,
    "directory_share_count": configuration.directorySharingDevices.count,
    "entropy_device_count": configuration.entropyDevices.count,
    "framework_validation_invoked": false,
    "graphics_device_count": configuration.graphicsDevices.count,
    "inspection_kind": "STRUCTURAL_ONLY_NO_BOOT_ARTIFACTS",
    "keyboard_count": configuration.keyboards.count,
    "maximum_allowed_cpu_count": VZVirtualMachineConfiguration.maximumAllowedCPUCount,
    "maximum_allowed_memory_size": VZVirtualMachineConfiguration.maximumAllowedMemorySize,
    "memory_balloon_device_count": configuration.memoryBalloonDevices.count,
    "memory_size": configuration.memorySize,
    "minimum_allowed_cpu_count": VZVirtualMachineConfiguration.minimumAllowedCPUCount,
    "minimum_allowed_memory_size": VZVirtualMachineConfiguration.minimumAllowedMemorySize,
    "mutation_performed": false,
    "network_device_count": configuration.networkDevices.count,
    "pointing_device_count": configuration.pointingDevices.count,
    "serial_port_count": configuration.serialPorts.count,
    "socket_device_count": configuration.socketDevices.count,
    "storage_device_count": configuration.storageDevices.count,
    "virtual_machine_created": false,
    "virtual_machine_started": false,
  ]
}

private func success(_ result: [String: Any]) {
  emit(["ok": true, "result": result, "schema": helperSchema])
}

private func reject() -> Never {
  emit([
    "error": ["code": "DOSAI_VIRTUALIZATION_PROBE_PROTOCOL_0001"],
    "ok": false,
    "schema": helperSchema,
  ])
  exit(64)
}

@main
private enum VirtualizationConfigurationProbe {
  static func main() {
    let arguments = Array(CommandLine.arguments.dropFirst())
    guard arguments.count == 1, let command = arguments.first else {
      reject()
    }
    switch command {
    case "describe":
      success(describe())
    case "inspect-fixed-profile":
      success(inspectFixedProfile())
    default:
      reject()
    }
  }
}
