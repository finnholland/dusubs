--[[
Dual subtitles: a VLC 3 extension that shows two subtitle tracks stacked in one.

It merges two tracks (external .srt/.ass files beside the video, or embedded
text tracks extracted with ffmpeg) into one generated ASS file and loads it
with vlc.input.add_subtitle. The merge logic is a port of merge.go.

Install: copy this file to %APPDATA%\vlc\lua\extensions\ and restart VLC, then
use View > Dual subtitles.
]]

local core = {} -- pure functions, no VLC calls (tested by test_dualsubs.lua)

----------------------------------------------------------------------------
-- Settings
----------------------------------------------------------------------------

core.palette = {
  { "White",  "&H00FFFFFF" },
  { "Yellow", "&H007AE9FF" },
  { "Pink",   "&H00FFB8F6" },
  { "Blue",   "&H00FFD8A8" },
  { "Green",  "&H00B8FFB8" },
}

function core.defaults()
  return {
    top_prefs = { "zh", "ja", "es" },
    bottom_prefs = { "en" },
    top_colour = "&H00FFFFFF",
    bottom_colour = "&H0000FFFF",
    font = "Arial",
    font_size = 48,
    fonts = { zh = "Microsoft YaHei", ja = "Yu Gothic", es = "Arial", en = "Arial" },
    bold_langs = { zh = true, ja = true },
    font_scale = 100, -- percent
    sub_position = 8, -- percent of the video height above the bottom edge
    stroke = true,
    window = false,
    shadow = false,
  }
end

local lang_alias = {
  zho = "zh", chi = "zh", cmn = "zh", yue = "zh",
  jpn = "ja", eng = "en", spa = "es", fra = "fr", fre = "fr",
  deu = "de", ger = "de", kor = "ko", rus = "ru", por = "pt",
  ita = "it", ara = "ar", hin = "hi", vie = "vi", tha = "th",
}

-- Language names that show up in sidecar file names (Movie.English.srt).
local lang_names = {
  chinese = "zh", japanese = "ja", english = "en", spanish = "es", french = "fr",
  german = "de", korean = "ko", russian = "ru", portuguese = "pt", italian = "it",
}

function core.norm_lang(s)
  s = (s or ""):lower():gsub("^%s+", ""):gsub("%s+$", "")
  local i = s:find("[-_]")
  if i and i > 1 then s = s:sub(1, i - 1) end
  return lang_alias[s] or lang_names[s] or s
end

function core.font_for(cfg, lang)
  local f = cfg.fonts[lang]
  if f and f ~= "" then return f end
  return cfg.font
end

----------------------------------------------------------------------------
-- Time and parsing
----------------------------------------------------------------------------

local function split_n(s, sep, n)
  local out, pos = {}, 1
  while #out < n - 1 do
    local i = s:find(sep, pos, true)
    if not i then break end
    out[#out + 1] = s:sub(pos, i - 1)
    pos = i + #sep
  end
  out[#out + 1] = s:sub(pos)
  return out
end

local function trim(s) return (s:gsub("^%s+", ""):gsub("%s+$", "")) end

-- h:mm:ss.cc to centiseconds
function core.parse_time_cs(s)
  local h, m, sec, frac = s:match("^(%d+):(%d+):(%d+)%.?(%d*)$")
  if not h then return 0 end
  frac = (frac .. "00"):sub(1, 2)
  return ((tonumber(h) * 60 + tonumber(m)) * 60 + tonumber(sec)) * 100 + tonumber(frac)
end

function core.format_time_cs(cs)
  return string.format("%d:%02d:%02d.%02d",
    math.floor(cs / 360000), math.floor(cs / 6000) % 60, math.floor(cs / 100) % 60, cs % 100)
end

-- Tags that fight the single bottom-centre block we draw.
local function strip_position_tags(text)
  text = text:gsub("\\an%d", ""):gsub("\\pos%b()", ""):gsub("\\move%b()", ""):gsub("\\org%b()", "")
  return (text:gsub("{}", ""))
end

-- Dialogue lines of an ASS document.
function core.parse_ass(ass)
  local events = {}
  local in_events = false
  local i_start, i_end, i_text, n_fields = 2, 3, 10, 10
  for line in (ass:gsub("\r", "") .. "\n"):gmatch("(.-)\n") do
    local t = trim(line)
    if t:sub(1, 1) == "[" then
      in_events = t:lower() == "[events]"
    elseif in_events then
      if t:sub(1, 7) == "Format:" then
        local cols = split_n(trim(t:sub(8)), ",", 1000)
        n_fields = #cols
        for i, c in ipairs(cols) do
          c = trim(c):lower()
          if c == "start" then i_start = i elseif c == "end" then i_end = i elseif c == "text" then i_text = i end
        end
      elseif t:sub(1, 9) == "Dialogue:" then
        local f = split_n(trim(t:sub(10)), ",", n_fields)
        if #f >= n_fields then
          events[#events + 1] = {
            start = core.parse_time_cs(trim(f[i_start])),
            stop = core.parse_time_cs(trim(f[i_end])),
            text = strip_position_tags(f[i_text]),
          }
        end
      end
    end
  end
  return events
end

-- SRT cues, with the common HTML-ish tags turned into ASS overrides.
function core.parse_srt(srt)
  local events = {}
  srt = srt:gsub("^\239\187\191", ""):gsub("\r", "")
  for block in (srt .. "\n\n"):gmatch("(.-)\n\n+") do
    local lines = {}
    for l in (block .. "\n"):gmatch("(.-)\n") do lines[#lines + 1] = l end
    local ti
    for i = 1, math.min(#lines, 2) do
      if lines[i]:find("-->", 1, true) then ti = i break end
    end
    if ti then
      local h1, m1, s1, f1, h2, m2, s2, f2 =
        lines[ti]:match("(%d+):(%d+):(%d+)[,.](%d+)%s*%-%->%s*(%d+):(%d+):(%d+)[,.](%d+)")
      if h1 then
        local function cs(h, m, s, f)
          return ((tonumber(h) * 60 + tonumber(m)) * 60 + tonumber(s)) * 100 + tonumber((f .. "00"):sub(1, 2))
        end
        local text = table.concat(lines, "\\N", ti + 1)
        text = text:gsub("<([/]?)([ibu])>", function(close, tag)
          return "{\\" .. tag .. (close == "/" and "0" or "1") .. "}"
        end):gsub("<[^>]*>", "")
        text = strip_position_tags(text)
        if trim(text) ~= "" then
          events[#events + 1] = { start = cs(h1, m1, s1, f1), stop = cs(h2, m2, s2, f2), text = text }
        end
      end
    end
  end
  return events
end

----------------------------------------------------------------------------
-- Merge (port of merge.go)
----------------------------------------------------------------------------

-- &HAABBGGRR style colour to an inline override tag.
local function colour_tag(c)
  c = c:upper():gsub("^&H", ""):gsub("&$", "")
  if #c > 6 then c = c:sub(-6) end
  return "{\\c&H" .. c .. "&}"
end

local function style_tag(colour, lang, cfg)
  local tag = colour_tag(colour):sub(1, -2) .. "\\fn" .. core.font_for(cfg, lang)
  tag = tag .. (cfg.bold_langs[lang] and "\\b1" or "\\b0")
  return tag .. "}"
end

local PLAY_RES_Y = 1080

function core.style_line(cfg)
  local size = math.floor(cfg.font_size * cfg.font_scale / 100)
  local margin_v = math.floor(PLAY_RES_Y * cfg.sub_position / 100)
  local border_style, outline, outline_colour, shadow = 1, 0, "&H00000000", 0
  if cfg.stroke then outline = 2 end
  if cfg.window then
    -- BorderStyle 3 draws a box in the outline colour behind the text.
    border_style, outline, outline_colour = 3, 6, "&H99000000"
  end
  if cfg.shadow then shadow = 1 end
  return string.format("Style: Default,%s,%d,&H00FFFFFF,&H000000FF,%s,&H80000000,0,0,0,0,100,100,0,0,%d,%d,%d,2,40,40,%d,1",
    cfg.font, size, outline_colour, border_style, outline, shadow, margin_v)
end

local function sorted_by_start(events)
  local out = {}
  for i, e in ipairs(events) do out[i] = { e = e, i = i } end
  table.sort(out, function(a, b)
    if a.e.start ~= b.e.start then return a.e.start < b.e.start end
    return a.i < b.i -- table.sort is not stable
  end)
  for i, x in ipairs(out) do out[i] = x.e end
  return out
end

local function active(events, t)
  local texts = {}
  for _, e in ipairs(events) do
    if e.start > t then break end -- sorted by start
    if t < e.stop then texts[#texts + 1] = e.text end
  end
  return table.concat(texts, "\\N")
end

-- One ASS file with both tracks in a single bottom-centre block: the top
-- track's line sits above the bottom track's, and the block changes whenever
-- either track changes. Takes parsed events.
function core.merge(top, bottom, top_lang, bottom_lang, cfg)
  top, bottom = sorted_by_start(top), sorted_by_start(bottom)
  local set, points = {}, {}
  for _, list in ipairs({ top, bottom }) do
    for _, e in ipairs(list) do
      for _, p in ipairs({ e.start, e.stop }) do
        if not set[p] then set[p] = true points[#points + 1] = p end
      end
    end
  end
  table.sort(points)

  local out = {
    "[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n",
    "[V4+ Styles]\n",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n",
    core.style_line(cfg) .. "\n\n",
    "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n",
  }
  local top_tag = style_tag(cfg.top_colour, top_lang, cfg)
  local bot_tag = style_tag(cfg.bottom_colour, bottom_lang, cfg)
  for i = 1, #points - 1 do
    local from, to = points[i], points[i + 1]
    local t, b = active(top, from), active(bottom, from)
    if t ~= "" or b ~= "" then
      local text
      if t ~= "" and b ~= "" then
        text = top_tag .. t .. "\\N" .. bot_tag .. b
      elseif t ~= "" then
        text = top_tag .. t
      else
        text = bot_tag .. b
      end
      out[#out + 1] = string.format("Dialogue: 0,%s,%s,Default,,0,0,0,,%s\n",
        core.format_time_cs(from), core.format_time_cs(to), text)
    end
  end
  return table.concat(out)
end

----------------------------------------------------------------------------
-- Tracks
----------------------------------------------------------------------------

local bitmap_codecs = {
  hdmv_pgs_subtitle = true, dvd_subtitle = true, dvb_subtitle = true, xsub = true, dvb_teletext = true,
}
local text_exts = { srt = true, ass = true, ssa = true }

-- Language from a sidecar file name: Movie.es.srt, Movie.spa.forced.ass, Movie.English.srt.
function core.sidecar_lang(video_base, file)
  local name = file:gsub("%.[^.]+$", "")
  local rest = name:sub(1, #video_base):lower() == video_base:lower() and name:sub(#video_base + 1) or name
  for tok in rest:gmatch("[^.%s_-]+") do
    local l = core.norm_lang(tok)
    if lang_alias[tok:lower()] or lang_names[tok:lower()] or #tok == 2 then return l end
  end
  return ""
end

-- ffprobe "compact" lines: index=2|codec_name=subrip|tag:language=eng|tag:title=Full
function core.parse_probe(output)
  local tracks, n = {}, 0
  for line in (output:gsub("\r", "") .. "\n"):gmatch("(.-)\n") do
    if line:find("codec_name=", 1, true) then
      local t = { order = n, lang = "", title = "" }
      for k, v in line:gmatch("([%w:_]+)=([^|]*)") do
        if k == "codec_name" then t.codec = v
        elseif k == "tag:language" then t.lang = v
        elseif k == "tag:title" then t.title = v end
      end
      n = n + 1
      if not bitmap_codecs[t.codec or ""] then
        t.kind = "embedded"
        tracks[#tracks + 1] = t
      end
    end
  end
  return tracks
end

-- Labels: language code, with the stream number added when a language repeats.
function core.labels(tracks)
  local count = {}
  for _, t in ipairs(tracks) do
    local c = core.norm_lang(t.lang):upper()
    count[c] = (count[c] or 0) + 1
  end
  local out = {}
  for i, t in ipairs(tracks) do
    local c = core.norm_lang(t.lang):upper()
    local num = (t.order or 0) + 1
    local label
    if (c == "" or c == "UND") and t.kind == "file" then
      label = (t.codec or "file"):upper()
    elseif c == "" or c == "UND" then
      label = "#" .. num
    elseif count[c] > 1 then
      label = c .. " " .. num
    else
      label = c
    end
    if t.title and t.title ~= "" then label = label .. " - " .. t.title end
    if t.kind == "file" then label = label .. " (file)" end
    out[i] = label
  end
  return out
end

-- First track matching the preferred languages in order, never `exclude`.
function core.pick(tracks, prefs, exclude)
  for _, p in ipairs(prefs) do
    local want = core.norm_lang(p)
    for i, t in ipairs(tracks) do
      if i ~= exclude and core.norm_lang(t.lang) == want then return i end
    end
  end
end

-- Small non-cryptographic hash for cache file names.
function core.hash(s)
  local h = 5381
  for i = 1, #s do h = (h * 33 + s:byte(i)) % 4294967296 end
  return string.format("%08x", h)
end

----------------------------------------------------------------------------
-- Everything below talks to VLC and the operating system.
----------------------------------------------------------------------------

if _TEST then _TEST.core = core return end

local dlg, widgets, tracks, cfg, media = nil, {}, {}, core.defaults(), nil
local ffmpeg_dir = ""

function descriptor()
  return {
    title = "Dual subtitles",
    version = "0.1",
    author = "dusubs",
    shortdesc = "Dual subtitles",
    description = "Show two subtitle tracks stacked in one.",
    capabilities = { "input-listener" },
  }
end

-- Computed on demand: during the descriptor() scan VLC loads this file without
-- the standard libraries, so nothing at top level may call into them.
local function windows() return package.config:sub(1, 1) == "\\" end

local function dirname(p) return p:match("^(.*)[/\\][^/\\]*$") or "." end
local function basename(p) return p:match("([^/\\]*)$") end
local function sep() return windows() and "\\" or "/" end

local function shell_quote(s)
  if windows() then return '"' .. s:gsub('"', "") .. '"' end
  return "'" .. s:gsub("'", "'\\''") .. "'"
end

local diag = {} -- what each external command did, shown when nothing is found

local function temp_dir()
  return os.getenv("TEMP") or os.getenv("TMPDIR") or "/tmp"
end

-- Runs a command line and returns its output, or nil. io.popen is tried first;
-- it can fail in a GUI process on Windows, so fall back to os.execute with the
-- output redirected to a file.
local function run(cmd)
  -- cmd.exe /c strips the outer quotes of a line that starts with a quote.
  local line = windows() and ('"' .. cmd .. '"') or cmd
  local ok, p = pcall(io.popen, line)
  if ok and p then
    local out = p:read("*a")
    p:close()
    if out and out ~= "" then return out end
    diag[#diag + 1] = "popen gave no output for: " .. cmd:sub(1, 60)
  else
    diag[#diag + 1] = "popen failed: " .. tostring(p)
  end
  local tmp = temp_dir() .. sep() .. "dualsubs-out.txt"
  os.remove(tmp)
  local full = windows() and ('"' .. cmd .. ' > "' .. tmp .. '" 2>&1"') or (cmd .. ' > "' .. tmp .. '" 2>&1')
  local rc = os.execute(full)
  local f = io.open(tmp, "rb")
  if not f then
    diag[#diag + 1] = "execute failed (" .. tostring(rc) .. "): " .. cmd:sub(1, 60)
    return nil
  end
  local out = f:read("*a")
  f:close()
  os.remove(tmp)
  if out == "" then diag[#diag + 1] = "execute gave no output for: " .. cmd:sub(1, 60) end
  return out
end

local function tool(name)
  if ffmpeg_dir ~= "" then return shell_quote(ffmpeg_dir .. sep() .. name) end
  return name
end

local function media_path()
  local item = vlc.input.item()
  if not item then return nil end
  local uri = item:uri()
  if not uri:match("^file:///") then return nil end
  local p = vlc.strings.decode_uri((uri:gsub("^file:///", "")))
  if windows() then return (p:gsub("/", "\\")) end
  return "/" .. p
end

local function list_dir(dir)
  local cmd = windows() and ('dir /b /a-d ' .. shell_quote(dir .. "\\*")) or ('ls -1 ' .. shell_quote(dir))
  local out = run(cmd) or ""
  local files = {}
  for line in out:gmatch("[^\r\n]+") do files[#files + 1] = line end
  return files
end

local function scan()
  tracks = {}
  diag = {}
  media = media_path()
  if not media then return end
  diag[#diag + 1] = "video: " .. media
  local dir, base = dirname(media), basename(media):gsub("%.[^.]+$", "")
  for _, f in ipairs(list_dir(dir)) do
    local ext = (f:match("%.([^.]+)$") or ""):lower()
    if text_exts[ext] and f:sub(1, #base):lower() == base:lower() then
      tracks[#tracks + 1] = {
        kind = "file", path = dir .. sep() .. f, codec = ext, title = f,
        lang = core.sidecar_lang(base, f), order = #tracks,
      }
    end
  end
  local nfiles = #tracks
  diag[#diag + 1] = nfiles .. " sidecar file(s)"
  local out = run(tool("ffprobe") .. " -v error -select_streams s -show_entries stream=codec_name:stream_tags=language,title -of compact=p=0 " .. shell_quote(media))
  if out then
    diag[#diag + 1] = "ffprobe: " .. out:sub(1, 80):gsub("%s+", " ")
    for _, t in ipairs(core.parse_probe(out)) do
      t.sub_index = t.order -- ffmpeg's -map 0:s:N counts embedded tracks only
      t.order = #tracks
      tracks[#tracks + 1] = t
    end
  end
end

local function read_file(path)
  local f = io.open(path, "rb")
  if not f then return nil end
  local s = f:read("*a")
  f:close()
  return s
end

-- Events of a track: files are parsed directly, embedded tracks go through ffmpeg.
local function events_for(t)
  if t.kind == "file" then
    local text = read_file(t.path)
    if not text then return nil, "cannot read " .. t.path end
    if t.codec == "srt" then return core.parse_srt(text) end
    return core.parse_ass(text)
  end
  local tmp = temp_dir() .. sep() .. "dualsubs-extract-" .. core.hash(media .. t.sub_index) .. ".ass"
  os.remove(tmp)
  run(tool("ffmpeg") .. " -y -v error -i " .. shell_quote(media) .. " -map 0:s:" .. t.sub_index .. " -c:s ass -f ass " .. shell_quote(tmp))
  local text = read_file(tmp)
  if not text then return nil, "ffmpeg could not extract track " .. (t.sub_index + 1) end
  os.remove(tmp)
  return core.parse_ass(text)
end

local function set_status(text)
  if widgets.status then widgets.status:set_text(text) end
  if dlg then dlg:update() end
end

local function read_settings()
  cfg.top_colour = core.palette[widgets.top_colour:get_value()][2]
  cfg.bottom_colour = core.palette[widgets.bottom_colour:get_value()][2]
  cfg.font_scale = widgets.size:get_value()
  cfg.sub_position = widgets.position:get_value()
  cfg.stroke = widgets.stroke:get_checked()
  cfg.window = widgets.window:get_checked()
  cfg.shadow = widgets.shadow:get_checked()
  ffmpeg_dir = (widgets.ffmpeg:get_text() or ""):gsub('^%s+', ''):gsub('%s+$', '')
end

function apply()
  read_settings()
  local ti, bi = widgets.top:get_value(), widgets.bottom:get_value()
  local top, bottom = tracks[ti], tracks[bi]
  if not top or not bottom then set_status("Pick two tracks first.") return end
  if ti == bi then set_status("Pick two different tracks.") return end
  set_status("Merging...")
  local te, err = events_for(top)
  if not te then set_status(err) return end
  local be, err2 = events_for(bottom)
  if not be then set_status(err2) return end
  local ass = core.merge(te, be, core.norm_lang(top.lang), core.norm_lang(bottom.lang), cfg)
  local path = temp_dir() .. sep() .. "dualsubs-" .. core.hash(ass) .. ".ass"
  local f = io.open(path, "wb")
  if not f then set_status("Cannot write " .. path) return end
  f:write(ass)
  f:close()
  local ok, e = pcall(vlc.input.add_subtitle, path, true)
  set_status(ok and "Applied." or ("VLC refused the subtitle: " .. tostring(e)))
end

function rescan()
  scan()
  fill_tracks()
end

function fill_tracks()
  local labels = core.labels(tracks)
  local ti = core.pick(tracks, cfg.top_prefs)
  local bi = core.pick(tracks, cfg.bottom_prefs, ti)
  -- VLC dropdowns select the first value added and offer no way to change it,
  -- so the preferred track goes first; ids stay the real track numbers.
  local function fill(w, first)
    w:clear()
    if first then w:add_value(labels[first], first) end
    for i, label in ipairs(labels) do
      if i ~= first then w:add_value(label, i) end
    end
  end
  fill(widgets.top, ti)
  fill(widgets.bottom, bi)
  if #tracks == 0 then
    set_status(media and ("Nothing found. " .. table.concat(diag, " | "))
      or "Play a local video first (a local file), then press Rescan.")
  else
    set_status(#tracks .. " subtitle tracks found.")
  end
  if dlg then dlg:update() end
end

-- Dropdowns select their first value, so the default goes first.
function add_default_first(w, values, default, suffix)
  w:add_value(default .. suffix, default)
  for _, v in ipairs(values) do
    if v ~= default then w:add_value(v .. suffix, v) end
  end
end

function activate()
  dlg = vlc.dialog("Dual subtitles")
  dlg:add_label("Top line", 1, 1, 1, 1)
  widgets.top = dlg:add_dropdown(2, 1, 3, 1)
  dlg:add_label("Bottom line", 1, 2, 1, 1)
  widgets.bottom = dlg:add_dropdown(2, 2, 3, 1)

  dlg:add_label("Size", 1, 3, 1, 1)
  widgets.size = dlg:add_dropdown(2, 3, 1, 1)
  add_default_first(widgets.size, { 75, 100, 125, 150, 175 }, cfg.font_scale, "%")
  dlg:add_label("Position", 3, 3, 1, 1)
  widgets.position = dlg:add_dropdown(4, 3, 1, 1)
  add_default_first(widgets.position, { 0, 8, 15, 25, 35 }, cfg.sub_position, "%")

  dlg:add_label("Top colour", 1, 4, 1, 1)
  widgets.top_colour = dlg:add_dropdown(2, 4, 1, 1)
  dlg:add_label("Bottom colour", 3, 4, 1, 1)
  widgets.bottom_colour = dlg:add_dropdown(4, 4, 1, 1)
  local function colour_index(c)
    for i, p in ipairs(core.palette) do if p[2] == c then return i end end
    return 1
  end
  for _, w in ipairs({ { widgets.top_colour, cfg.top_colour }, { widgets.bottom_colour, cfg.bottom_colour } }) do
    local first = colour_index(w[2])
    w[1]:add_value(core.palette[first][1], first)
    for i, p in ipairs(core.palette) do
      if i ~= first then w[1]:add_value(p[1], i) end
    end
  end

  widgets.stroke = dlg:add_check_box("Stroke", cfg.stroke, 1, 5, 1, 1)
  widgets.window = dlg:add_check_box("Window", cfg.window, 2, 5, 1, 1)
  widgets.shadow = dlg:add_check_box("Shadow", cfg.shadow, 3, 5, 1, 1)

  dlg:add_label("ffmpeg folder", 1, 6, 1, 1)
  widgets.ffmpeg = dlg:add_text_input("", 2, 6, 3, 1)

  dlg:add_button("Rescan", rescan, 1, 7, 1, 1)
  dlg:add_button("Apply", apply, 2, 7, 3, 1)
  widgets.status = dlg:add_label("", 1, 8, 4, 1)
  rescan()
end

function deactivate()
  if dlg then dlg:delete() dlg = nil end
end

function close() vlc.deactivate() end

function input_changed() if dlg then rescan() end end
