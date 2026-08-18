// ═══════════════════════════════════════════════════════════════════════════════
// VIBEE AI MEDIA SERVER - Zig + xAI Grok Imagine + Cartesia
// Following trinity patterns - custom HTTP server in Zig
//
// Endpoints (accessed via Vite proxy which strips /api prefix):
//   POST /generate/image      - xAI grok-imagine-image
//   POST /generate/video      - xAI grok-imagine-video (async)
//   GET  /generate/video/:id  - Poll video status
//   POST /ai/generate-script  - xAI script generation
//   POST /generate/audio      - Cartesia TTS
//   POST /stt/transcribe      - Cartesia STT
//   GET  /health              - Health check
// ═══════════════════════════════════════════════════════════════════════════════

const std = @import("std");

const Allocator = std.mem.Allocator;

/// Simple JSON string escape
fn jsonEscape(allocator: Allocator, str: []const u8) ![]const u8 {
    var result = std.ArrayListUnmanaged(u8){};
    errdefer result.deinit(allocator);

    for (str) |c| {
        switch (c) {
            '"' => try result.appendSlice(allocator, "\\\""),
            '\\' => try result.appendSlice(allocator, "\\\\"),
            '\n' => try result.appendSlice(allocator, "\\n"),
            '\r' => try result.appendSlice(allocator, "\\r"),
            '\t' => try result.appendSlice(allocator, "\\t"),
            else => try result.append(allocator, c),
        }
    }
    return result.toOwnedSlice(allocator);
}

/// Pending video generation request
const VideoRequest = struct {
    request_id: []const u8,
    prompt: []const u8,
    started: i64,
};

/// HTTP response status
const Status = enum(u16) {
    ok = 200,
    bad_request = 400,
    not_found = 404,
    internal_error = 500,
};

pub const AiMediaServer = struct {
    allocator: Allocator,
    port: u16,
    xai_key: []const u8,
    cartesia_key: []const u8,
    startup_time: i64,

    // In-memory storage for pending videos
    pending_videos: std.StringHashMap(VideoRequest),

    const Self = @This();

    pub fn init(allocator: Allocator, port: u16, xai_key: []const u8, cartesia_key: []const u8) Self {
        return Self{
            .allocator = allocator,
            .port = port,
            .xai_key = xai_key,
            .cartesia_key = cartesia_key,
            .startup_time = std.time.timestamp(),
            .pending_videos = std.StringHashMap(VideoRequest).init(allocator),
        };
    }

    pub fn deinit(self: *Self) void {
        var iter = self.pending_videos.iterator();
        while (iter.next()) |entry| {
            self.allocator.free(entry.key_ptr.*);
            self.allocator.free(entry.value_ptr.prompt);
        }
        self.pending_videos.deinit();
    }

    /// Run the HTTP server
    pub fn run(self: *Self) !void {
        const address = std.net.Address.initIp4(.{ 0, 0, 0, 0 }, self.port);
        var server = try address.listen(.{ .reuse_address = true });
        defer server.deinit();

        std.log.info("🎬 AI Media Server listening on http://0.0.0.0:{}\n", .{self.port});
        std.log.info("╔══════════════════════════════════════════════════════════════╗\n", .{});
        std.log.info("║  📜 Script   │  xAI Grok (chat completions)                  ║\n", .{});
        std.log.info("║  🖼️  Image   │  xAI grok-imagine-image                       ║\n", .{});
        std.log.info("║  🎥 Video    │  xAI grok-imagine-video (async)               ║\n", .{});
        std.log.info("║  🔊 TTS      │  Cartesia Sonic-3                              ║\n", .{});
        std.log.info("║  🎤 STT      │  Cartesia STT                                  ║\n", .{});
        std.log.info("╚══════════════════════════════════════════════════════════════╝\n", .{});

        while (true) {
            var connection = server.accept() catch |err| {
                std.log.err("Accept error: {}\n", .{err});
                continue;
            };
            self.handleConnection(&connection) catch |err| {
                std.log.err("Connection error: {}\n", .{err});
            };
        }
    }

    /// Handle incoming HTTP connection
    fn handleConnection(self: *Self, connection: *std.net.Server.Connection) !void {
        defer connection.stream.close();

        // Read request
        var buffer: [8192]u8 = undefined;
        const request_data = connection.stream.read(&buffer) catch |err| {
            std.log.err("Read error: {}\n", .{err});
            return;
        };
        if (request_data == 0) return;

        // Parse HTTP request line
        const request_text = buffer[0..request_data];
        var line_iter = std.mem.splitScalar(u8, request_text, '\n');
        const first_line = line_iter.first();

        var parts = std.mem.splitScalar(u8, first_line, ' ');
        const method = parts.next() orelse return;
        const path = parts.next() orelse return;

        std.log.info("{s} {s}\n", .{ method, path });

        // CORS preflight
        if (std.mem.eql(u8, method, "OPTIONS")) {
            try self.sendCorsResponse(connection.stream);
            return;
        }

        // Parse body if POST
        var body: []const u8 = "";
        if (std.mem.eql(u8, method, "POST")) {
            // Find empty line separating headers from body
            if (std.mem.indexOf(u8, request_text, "\r\n\r\n")) |idx| {
                body = request_text[idx + 4 ..];
            }
        }

        // Route request
        // Note: Vite proxy strips /api prefix, so we match paths without it
        if (std.mem.eql(u8, method, "GET") and std.mem.eql(u8, path, "/")) {
            // Root endpoint - return API info
            const info = try std.fmt.allocPrint(self.allocator, "{{\"name\":\"VIBEE AI Media Server\",\"version\":\"1.0.0\",\"endpoints\":[\"/health\",\"/generate/image\",\"/generate/video\",\"/ai/generate-script\",\"/generate/audio\",\"/stt/transcribe\"]}}", .{});
            defer self.allocator.free(info);
            try self.sendResponse(connection.stream, .ok, info);
        } else if (std.mem.eql(u8, method, "GET") and std.mem.eql(u8, path, "/health")) {
            try self.handleHealth(connection.stream);
        } else if (std.mem.eql(u8, method, "POST") and std.mem.eql(u8, path, "/generate/image")) {
            try self.handleImageGen(connection.stream, body);
        } else if (std.mem.eql(u8, method, "POST") and std.mem.eql(u8, path, "/generate/video")) {
            try self.handleVideoStart(connection.stream, body);
        } else if (std.mem.eql(u8, method, "GET") and std.mem.startsWith(u8, path, "/generate/video/")) {
            const request_id = path["/generate/video/".len..];
            try self.handleVideoPoll(connection.stream, request_id);
        } else if (std.mem.eql(u8, method, "POST") and std.mem.eql(u8, path, "/ai/generate-script")) {
            try self.handleScriptGen(connection.stream, body);
        } else if (std.mem.eql(u8, method, "POST") and std.mem.eql(u8, path, "/generate/audio")) {
            try self.handleTTS(connection.stream, body);
        } else if (std.mem.eql(u8, method, "POST") and std.mem.eql(u8, path, "/stt/transcribe")) {
            try self.handleSTT(connection.stream, body);
        } else {
            try self.sendResponse(connection.stream, .not_found, "{\"error\":\"Not Found\"}");
        }
    }

    /// Send CORS response
    fn sendCorsResponse(self: *Self, stream: std.net.Stream) !void {
        _ = self;
        const response = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, GET, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\n\r\n";
        _ = try stream.writeAll(response);
    }

    /// Send HTTP response with JSON body
    fn sendResponse(self: *Self, stream: std.net.Stream, status: Status, body: []const u8) !void {
        const status_code = @intFromEnum(status);
        const response = try std.fmt.allocPrint(self.allocator, "HTTP/1.1 {d} {s}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {d}\r\n\r\n{s}", .{ status_code, @tagName(status), body.len, body });
        defer self.allocator.free(response);
        _ = try stream.writeAll(response);
    }

    /// Send JSON error response
    fn sendError(self: *Self, stream: std.net.Stream, status: Status, err_msg: []const u8) !void {
        const escaped = try jsonEscape(self.allocator, err_msg);
        defer self.allocator.free(escaped);
        const json = try std.fmt.allocPrint(self.allocator, "{{\"success\":false,\"error\":\"{s}\"}}", .{escaped});
        defer self.allocator.free(json);
        try self.sendResponse(stream, status, json);
    }

    /// Handle health check
    fn handleHealth(self: *Self, stream: std.net.Stream) !void {
        const uptime = std.time.timestamp() - self.startup_time;
        const json = try std.fmt.allocPrint(self.allocator, "{{\"status\":\"ok\",\"uptime\":{d},\"services\":{{\"xai\":true,\"cartesia\":true}}}}", .{uptime});
        defer self.allocator.free(json);
        try self.sendResponse(stream, .ok, json);
    }

    /// Handle xAI image generation
    fn handleImageGen(self: *Self, stream: std.net.Stream, body: []const u8) !void {
        // Parse JSON (simplified - in production use proper JSON parser)
        const prompt_value = if (std.mem.indexOf(u8, body, "\"prompt\"")) |idx| blk: {
            const after = body[idx + 8 ..];
            const start = std.mem.indexOf(u8, after, "\"") orelse break :blk "";
            const after_quote = after[start + 1 ..];
            const end = std.mem.indexOf(u8, after_quote, "\"") orelse break :blk "";
            break :blk after_quote[0..end];
        } else "";

        if (prompt_value.len == 0) return self.sendError(stream, .bad_request, "prompt required");

        std.log.info("🖼️  Image: {s}...\n", .{prompt_value[0..@min(prompt_value.len, 35)]});

        // Make HTTP request to xAI
        const escaped_prompt = try jsonEscape(self.allocator, prompt_value);
        defer self.allocator.free(escaped_prompt);
        const xai_body = try std.fmt.allocPrint(self.allocator, "{{\"model\":\"grok-imagine-image\",\"prompt\":\"{s}\",\"n\":1,\"aspect_ratio\":\"16:9\",\"image_format\":\"url\"}}", .{escaped_prompt});
        defer self.allocator.free(xai_body);

        const result = try self.httpRequest("api.x.ai", 443, "/v1/images/generations", "POST", xai_body, self.xai_key);

        if (result.status != 200) {
            const status: Status = if (result.status == 400) .bad_request else if (result.status == 404) .not_found else .internal_error;
            return self.sendError(stream, status, result.body);
        }

        const response = try std.fmt.allocPrint(self.allocator, "{{\"success\":true,\"url\":{s}}}", .{result.body});
        defer self.allocator.free(response);

        try self.sendResponse(stream, .ok, response);
    }

    /// Handle video generation start
    fn handleVideoStart(self: *Self, stream: std.net.Stream, body: []const u8) !void {
        const prompt_value = if (std.mem.indexOf(u8, body, "\"prompt\"")) |idx| blk: {
            const after = body[idx + 8 ..];
            const start = std.mem.indexOf(u8, after, "\"") orelse break :blk "";
            const after_quote = after[start + 1 ..];
            const end = std.mem.indexOf(u8, after_quote, "\"") orelse break :blk "";
            break :blk after_quote[0..end];
        } else "";

        if (prompt_value.len == 0) return self.sendError(stream, .bad_request, "prompt required");

        std.log.info("🎥 Video start: {s}...\n", .{prompt_value[0..@min(prompt_value.len, 35)]});

        const escaped = try jsonEscape(self.allocator, prompt_value);
        defer self.allocator.free(escaped);
        const xai_body = try std.fmt.allocPrint(self.allocator, "{{\"model\":\"grok-imagine-video\",\"prompt\":\"{s}\",\"duration\":5,\"aspect_ratio\":\"16:9\",\"resolution\":\"720p\"}}", .{escaped});
        defer self.allocator.free(xai_body);

        const result = try self.httpRequest("api.x.ai", 443, "/v1/videos/generations", "POST", xai_body, self.xai_key);

        if (result.status != 200) {
            const status: Status = if (result.status == 400) .bad_request else if (result.status == 404) .not_found else .internal_error;
            return self.sendError(stream, status, result.body);
        }

        // Extract request_id from response {"request_id":"..."}
        const request_id = if (std.mem.indexOf(u8, result.body, "\"request_id\"")) |idx| blk: {
            const after = result.body[idx + 13 ..];
            const start = std.mem.indexOf(u8, after, "\"") orelse break :blk "";
            const after_quote = after[start + 1 ..];
            const end = std.mem.indexOf(u8, after_quote, "\"") orelse break :blk "";
            break :blk try self.allocator.dupe(u8, after_quote[0..end]);
        } else try self.allocator.dupe(u8, "");

        if (request_id.len == 0) {
            self.allocator.free(request_id);
            return self.sendError(stream, .internal_error, "no request_id in response");
        }

        // Store pending request
        try self.pending_videos.put(request_id, VideoRequest{
            .request_id = request_id,
            .prompt = try self.allocator.dupe(u8, prompt_value),
            .started = std.time.timestamp(),
        });

        const response = try std.fmt.allocPrint(self.allocator, "{{\"success\":true,\"request_id\":\"{s}\"}}", .{request_id});
        defer self.allocator.free(response);

        try self.sendResponse(stream, .ok, response);
    }

    /// Handle video poll
    fn handleVideoPoll(self: *Self, stream: std.net.Stream, request_id: []const u8) !void {
        std.log.info("🎥 Video poll: {s}\n", .{request_id});

        const path = try std.fmt.allocPrint(self.allocator, "/v1/videos/{s}", .{request_id});
        defer self.allocator.free(path);

        const result = try self.httpRequest("api.x.ai", 443, path, "GET", "", self.xai_key);

        if (result.status != 200) {
            const status: Status = if (result.status == 400) .bad_request else if (result.status == 404) .not_found else .internal_error;
            return self.sendError(stream, status, result.body);
        }

        // Check if done
        if (std.mem.indexOf(u8, result.body, "\"status\":\"done\"")) |_| {
            std.log.info("✅ Video ready!\n", .{});
            if (self.pending_videos.fetchRemove(request_id)) |entry| {
                self.allocator.free(entry.value.prompt);
                self.allocator.free(entry.key);
            }
        }

        try self.sendResponse(stream, .ok, result.body);
    }

    /// Handle script generation
    fn handleScriptGen(self: *Self, stream: std.net.Stream, body: []const u8) !void {
        const topic_value = if (std.mem.indexOf(u8, body, "\"topic\"")) |idx| blk: {
            const after = body[idx + 8 ..];
            const start = std.mem.indexOf(u8, after, "\"") orelse break :blk "";
            const after_quote = after[start + 1 ..];
            const end = std.mem.indexOf(u8, after_quote, "\"") orelse break :blk "";
            break :blk after_quote[0..end];
        } else "";

        if (topic_value.len == 0) return self.sendError(stream, .bad_request, "topic required");

        std.log.info("📜 Script: {s}\n", .{topic_value});

        const system_prompt = "Return ONLY JSON: {voiceover, cover_prompt, broll_prompts[], captions[]}";
        const escaped_topic = try jsonEscape(self.allocator, topic_value);
        defer self.allocator.free(escaped_topic);
        const user_prompt = try std.fmt.allocPrint(self.allocator, "Create engaging 30s video script about: {s}. Language: English.", .{escaped_topic});
        defer self.allocator.free(user_prompt);

        const escaped_user = try jsonEscape(self.allocator, user_prompt);
        defer self.allocator.free(escaped_user);
        const messages = try std.fmt.allocPrint(self.allocator, "[{{\"role\":\"system\",\"content\":\"{s}\"}},{{\"role\":\"user\",\"content\":\"{s}\"}}]", .{ system_prompt, escaped_user });
        defer self.allocator.free(messages);

        const xai_body = try std.fmt.allocPrint(self.allocator, "{{\"messages\":{s},\"temperature\":0.7,\"max_tokens\":2000}}", .{messages});
        defer self.allocator.free(xai_body);

        const result = try self.httpRequest("api.x.ai", 443, "/v1/chat/completions", "POST", xai_body, self.xai_key);

        if (result.status != 200) {
            return self.sendError(stream, .internal_error, result.body);
        }

        // For now, return the raw response - proper JSON parsing would be added here
        try self.sendResponse(stream, .ok, result.body);
    }

    /// Handle TTS
    fn handleTTS(self: *Self, stream: std.net.Stream, body: []const u8) !void {
        const text_value = if (std.mem.indexOf(u8, body, "\"text\"")) |idx| blk: {
            const after = body[idx + 7 ..];
            const start = std.mem.indexOf(u8, after, "\"") orelse break :blk "";
            const after_quote = after[start + 1 ..];
            const end = std.mem.indexOf(u8, after_quote, "\"") orelse break :blk "";
            break :blk after_quote[0..end];
        } else "";

        if (text_value.len == 0) return self.sendError(stream, .bad_request, "text required");

        std.log.info("🔊 TTS: {s}...\n", .{text_value[0..@min(text_value.len, 30)]});

        const escaped_text = try jsonEscape(self.allocator, text_value);
        defer self.allocator.free(escaped_text);
        const cartesia_body = try std.fmt.allocPrint(self.allocator, "{{\"transcript\":\"{s}\",\"model_id\":\"sonic-3\",\"voice\":{{\"mode\":\"id\",\"id\":\"694f9389-aac1-45b6-b726-9d9369183238\"}},\"output_format\":{{\"container\":\"wav\",\"encoding\":\"pcm_s16le\",\"sample_rate\":44100}}}}", .{escaped_text});
        defer self.allocator.free(cartesia_body);

        const result = try self.httpRequest("api.cartesia.ai", 443, "/tts/bytes", "POST", cartesia_body, self.cartesia_key);

        if (result.status != 200) {
            const status: Status = if (result.status == 400) .bad_request else if (result.status == 404) .not_found else .internal_error;
            return self.sendError(stream, status, result.body);
        }

        // Return base64 encoded audio
        const encoder = std.base64.standard.Encoder;
        const encoded_len = encoder.calcSize(result.body.len);
        const base64_audio = try self.allocator.alloc(u8, encoded_len);
        _ = encoder.encode(base64_audio, result.body);
        defer self.allocator.free(base64_audio);

        const response = try std.fmt.allocPrint(self.allocator, "{{\"success\":true,\"audio\":\"{s}\",\"format\":\"wav\"}}", .{base64_audio});
        defer self.allocator.free(response);

        try self.sendResponse(stream, .ok, response);
    }

    /// Handle STT
    fn handleSTT(self: *Self, stream: std.net.Stream, body: []const u8) !void {
        std.log.info("🎤 STT request\n", .{});

        const cartesia_body = try std.fmt.allocPrint(self.allocator, "{s}", .{body});
        defer self.allocator.free(cartesia_body);

        const result = try self.httpRequest("api.cartesia.ai", 443, "/stt", "POST", cartesia_body, self.cartesia_key);

        try self.sendResponse(stream, @enumFromInt(result.status), result.body);
    }

    /// Make HTTPS request (uses curl for TLS)
    const HttpRequestResult = struct {
        status: u16,
        body: []const u8,
    };

    fn httpRequest(self: *Self, hostname: []const u8, port: u16, path: []const u8, method: []const u8, req_body: []const u8, api_key: []const u8) !HttpRequestResult {
        // Spawn curl to do HTTPS (Zig TLS is complex, would need mbedtls)
        const curl_cmd = if (req_body.len > 0)
            try std.fmt.allocPrint(self.allocator, "curl -s -X {s} 'https://{s}:{d}{s}' -H 'Authorization: Bearer {s}' -H 'Content-Type: application/json' -d '{s}'", .{ method, hostname, port, path, api_key, req_body })
        else
            try std.fmt.allocPrint(self.allocator, "curl -s -X {s} 'https://{s}:{d}{s}' -H 'Authorization: Bearer {s}' -H 'Content-Type: application/json'", .{ method, hostname, port, path, api_key });
        defer self.allocator.free(curl_cmd);

        const result = std.process.Child.run(.{
            .allocator = self.allocator,
            .argv = &[_][]const u8{ "sh", "-c", curl_cmd },
        }) catch |err| {
            std.log.err("curl failed: {}\n", .{err});
            return error.CurlFailed;
        };
        defer self.allocator.free(result.stdout);
        defer self.allocator.free(result.stderr);

        // Parse status from curl (simplified)
        // In production, parse HTTP response properly
        return HttpRequestResult{
            .status = if (result.stdout.len > 0) 200 else 500,
            .body = try self.allocator.dupe(u8, result.stdout),
        };
    }
};

/// Main entry point
pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    // Load API keys from environment
    const xai_key = std.process.getEnvVarOwned(allocator, "XAI_API_KEY") catch "";
    const cartesia_key = std.process.getEnvVarOwned(allocator, "CARTESIA_API_KEY") catch "";

    if (xai_key.len == 0) {
        std.log.err("⚠️  XAI_API_KEY not set!\n", .{});
    }
    if (cartesia_key.len == 0) {
        std.log.err("⚠️  CARTESIA_API_KEY not set!\n", .{});
    }

    var server = AiMediaServer.init(allocator, 3333, xai_key, cartesia_key);
    defer server.deinit();

    server.run() catch |err| {
        std.log.err("Server error: {}\n", .{err});
        std.process.exit(1);
    };
}
