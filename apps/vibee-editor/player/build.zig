const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Create root module for Zig 0.15.2
    const root_module = b.createModule(.{
        .root_source_file = b.path("ai-server.zig"),
        .target = target,
        .optimize = optimize,
    });

    // AI Media Server executable
    const exe = b.addExecutable(.{
        .name = "ai-server",
        .root_module = root_module,
    });

    b.installArtifact(exe);

    // Run step
    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| run_cmd.addArgs(args);

    const run_step = b.step("run", "Run the AI Media Server");
    run_step.dependOn(&run_cmd.step);
}
