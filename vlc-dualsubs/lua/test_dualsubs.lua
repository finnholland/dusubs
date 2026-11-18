-- Tests for the pure part of dualsubs.lua. Run with any Lua 5.1 interpreter:
--   lua test_dualsubs.lua [golden-dir]
-- golden-dir holds top.ass, bot.ass, golden.ass, golden2.ass produced by the Go
-- mergeASS, to check that the Lua port output is byte-identical.

_TEST = {}
dofile("dualsubs.lua")
local core = _TEST.core

local failures = 0
local function eq(got, want, name)
  if got ~= want then
    failures = failures + 1
    print("FAIL " .. name .. "\n  got:  " .. tostring(got) .. "\n  want: " .. tostring(want))
  end
end

-- Sample from merge_test.go
local top_sample = [[
[Script Info]
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:05.00,0:00:08.00,Default,,0,0,0,,{\an8}你好, 世界
]]
local bot_sample = [[
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.50,0:00:03.00,Default,,0,0,0,,Hello
Dialogue: 0,0:00:06.00,0:00:09.00,Default,,0,0,0,,{\pos(10,10)}Hello, world
]]
local cfg = core.defaults()
local out = core.merge(core.parse_ass(top_sample), core.parse_ass(bot_sample), "zh", "en", cfg)
local lines = {}
for l in out:gmatch("[^\n]+") do if l:sub(1, 9) == "Dialogue:" then lines[#lines + 1] = l end end
local zh = [[{\c&HFFFFFF&\fnMicrosoft YaHei\b1}]]
local en = [[{\c&H00FFFF&\fnArial\b0}]]
eq(#lines, 4, "event count")
eq(lines[1], "Dialogue: 0,0:00:01.50,0:00:03.00,Default,,0,0,0,," .. en .. "Hello", "event 1")
eq(lines[2], "Dialogue: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,," .. zh .. "你好, 世界", "event 2")
eq(lines[3], "Dialogue: 0,0:00:06.00,0:00:08.00,Default,,0,0,0,," .. zh .. "你好, 世界\\N" .. en .. "Hello, world", "event 3")
eq(lines[4], "Dialogue: 0,0:00:08.00,0:00:09.00,Default,,0,0,0,," .. en .. "Hello, world", "event 4")

-- SRT
local srt = "\239\187\1911\r\n00:00:01,500 --> 00:00:03,000\r\n<i>Hello</i>\r\n<font color=\"red\">there</font>\r\n\r\n2\r\n00:01:02,050 --> 00:01:03,000\r\n{\\an8}Top\r\n"
local ev = core.parse_srt(srt)
eq(#ev, 2, "srt count")
eq(ev[1].start, 150, "srt start")
eq(ev[1].stop, 300, "srt stop")
eq(ev[1].text, "{\\i1}Hello{\\i0}\\Nthere", "srt text")
eq(ev[2].start, 6205, "srt start 2")
eq(ev[2].text, "Top", "srt position tag stripped")

-- Times
eq(core.parse_time_cs("1:02:03.45"), ((1 * 60 + 2) * 60 + 3) * 100 + 45, "parse time")
eq(core.format_time_cs(core.parse_time_cs("1:02:03.45")), "1:02:03.45", "time round trip")

-- Labels and picking
local tracks = {
  { order = 0, lang = "chi" }, { order = 1, lang = "eng" }, { order = 2, lang = "eng" }, { order = 3, lang = "" },
}
local labels = core.labels(tracks)
eq(table.concat(labels, "|"), "ZH|EN 2|EN 3|#4", "labels")
eq(core.pick(tracks, { "zh" }), 1, "pick zh")
eq(core.pick(tracks, { "en" }, 2), 3, "pick excludes")
eq(core.pick(tracks, { "fr" }), nil, "pick none")

-- Sidecar language
eq(core.sidecar_lang("Movie", "Movie.es.srt"), "es", "sidecar es")
eq(core.sidecar_lang("Movie", "Movie.spa.forced.ass"), "es", "sidecar spa forced")
eq(core.sidecar_lang("Movie", "Movie.English.srt"), "en", "sidecar English")
eq(core.sidecar_lang("Movie", "Movie.srt"), "", "sidecar none")

-- ffprobe compact output
local probe = "index=2|codec_name=subrip|tag:language=eng|tag:title=Signs & Songs\n" ..
  "codec_name=hdmv_pgs_subtitle|tag:language=jpn\n" ..
  "codec_name=ass|tag:language=chi\n"
local pt = core.parse_probe(probe)
eq(#pt, 2, "probe skips bitmap")
eq(pt[1].title, "Signs & Songs", "probe title")
eq(pt[2].order, 2, "probe keeps the ffmpeg stream ordinal")

-- Byte-for-byte parity with the Go implementation
local dir = arg and arg[1]
if dir then
  local function read(p) local f = assert(io.open(dir .. "/" .. p, "rb")) local s = f:read("*a") f:close() return s end
  local t, b = core.parse_ass(read("top.ass")), core.parse_ass(read("bot.ass"))
  local c = core.defaults()
  eq(core.merge(t, b, "zh", "en", c), read("golden.ass"), "golden parity")
  c.window, c.shadow, c.font_scale, c.sub_position = true, true, 150, 20
  eq(core.merge(t, b, "zh", "en", c), read("golden2.ass"), "golden parity (window/shadow/150%/20%)")
end

if failures > 0 then print(failures .. " failure(s)") os.exit(1) end
print("ok")
