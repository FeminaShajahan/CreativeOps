"""
CreativeOps — AI Bitrate & Volume Optimizer Backend
Flask server exposing two endpoints:
  POST /analyze  — Librosa feature extraction + YAMNet audio classification
  POST /optimize — FFmpeg loudnorm + bitrate re-encode (returns optimized MP3)
"""

import os
import csv
import tempfile
import subprocess

import numpy as np
import librosa
import pyloudnorm as pyln
import soundfile as sf
import tensorflow as tf
import tensorflow_hub as hub
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ─── YAMNet model (loaded once on first request) ──────────────────────────────
_yamnet_model = None
_yamnet_class_names = None

def _load_yamnet():
    global _yamnet_model, _yamnet_class_names
    if _yamnet_model is None:
        _yamnet_model = hub.load('https://tfhub.dev/google/yamnet/1')
        class_map_path = _yamnet_model.class_map_path().numpy().decode('utf-8')
        _yamnet_class_names = []
        with tf.io.gfile.GFile(class_map_path) as f:
            reader = csv.DictReader(f)
            for row in reader:
                _yamnet_class_names.append(row['display_name'])
    return _yamnet_model, _yamnet_class_names


# ─── AI recommendation logic ──────────────────────────────────────────────────
def _recommend(top_labels: list[str]) -> dict:
    """Map YAMNet top labels → bitrate/LUFS recommendation."""
    joined = ' '.join(top_labels).lower()

    if any(w in joined for w in ['speech', 'narration', 'monologue', 'conversation',
                                   'talking', 'voice', 'podcast']):
        return {
            'content_type': 'Speech / Podcast',
            'bitrate': 96,
            'lufs': -16,
            'reason': ('Speech detected — voice content is well-served at 96 kbps. '
                       '-16 LUFS matches podcast loudness standards (Apple, Spotify Podcasts).'),
        }

    if any(w in joined for w in ['music', 'singing', 'song', 'instrument',
                                   'beat', 'melody', 'guitar', 'piano',
                                   'drum', 'bass', 'hip hop', 'pop']):
        return {
            'content_type': 'Music',
            'bitrate': 192,
            'lufs': -14,
            'reason': ('Music detected — 192 kbps preserves fidelity. '
                       '-14 LUFS matches Spotify / Apple Music streaming standard.'),
        }

    if any(w in joined for w in ['silence', 'quiet', 'ambient', 'noise']):
        return {
            'content_type': 'Ambient / Silence',
            'bitrate': 64,
            'lufs': -18,
            'reason': 'Low-energy or ambient content detected — minimal bitrate is sufficient.',
        }

    return {
        'content_type': 'General Audio',
        'bitrate': 128,
        'lufs': -14,
        'reason': ('Mixed or unclassified content — balanced 128 kbps / -14 LUFS '
                   'settings applied (broadcast standard).'),
    }


# ─── /analyze ─────────────────────────────────────────────────────────────────
@app.route('/analyze', methods=['POST'])
def analyze():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400

    f = request.files['audio']
    suffix = os.path.splitext(f.filename)[1] or '.tmp'

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name
        f.save(tmp_path)

    try:
        # Load audio (native sample rate, mono)
        y, sr = librosa.load(tmp_path, sr=None, mono=True)

        # ── Librosa features ─────────────────────────────────────────────────
        # Integrated loudness (LUFS / EBU R128)
        meter = pyln.Meter(sr)
        integrated_lufs = meter.integrated_loudness(y)
        if np.isinf(integrated_lufs):
            integrated_lufs = -70.0  # silence guard

        rms = float(np.sqrt(np.mean(y ** 2)))
        rms_db = float(20 * np.log10(rms + 1e-9))
        peak_db = float(20 * np.log10(np.max(np.abs(y)) + 1e-9))
        dynamic_range = round(peak_db - rms_db, 1)

        tempo_arr, _ = librosa.beat.beat_track(y=y, sr=sr)
        tempo = float(tempo_arr) if np.ndim(tempo_arr) == 0 else float(tempo_arr[0])

        spec_centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))

        librosa_features = {
            'integrated_lufs': round(float(integrated_lufs), 1),
            'rms_db': round(rms_db, 1),
            'peak_db': round(peak_db, 1),
            'dynamic_range_db': dynamic_range,
            'tempo_bpm': round(tempo, 1),
            'spectral_centroid_hz': round(spec_centroid, 0),
        }

        # ── YAMNet classification ─────────────────────────────────────────────
        # YAMNet requires 16 kHz mono float32
        y16k = librosa.resample(y, orig_sr=sr, target_sr=16000) if sr != 16000 else y
        waveform = tf.constant(y16k, dtype=tf.float32)

        model, class_names = _load_yamnet()
        scores, _, _ = model(waveform)
        mean_scores = tf.reduce_mean(scores, axis=0).numpy()
        top_idx = np.argsort(mean_scores)[::-1][:5]
        top_labels = [class_names[i] for i in top_idx]
        top_scores = [round(float(mean_scores[i]), 3) for i in top_idx]

        recommendation = _recommend(top_labels)

        return jsonify({
            'librosa': librosa_features,
            'yamnet': {
                'labels': top_labels,
                'scores': top_scores,
            },
            'recommendation': recommendation,
        })

    finally:
        os.unlink(tmp_path)


# ─── /optimize ────────────────────────────────────────────────────────────────
VIDEO_EXTENSIONS = {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.flv'}
AUDIO_EXTENSIONS = {'.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'}

@app.route('/optimize', methods=['POST'])
def optimize():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400

    f = request.files['audio']
    bitrate = request.form.get('bitrate', '128')
    lufs = request.form.get('lufs', '-14')

    suffix = os.path.splitext(f.filename)[1].lower() or '.mp3'
    mime = (f.content_type or '').lower()
    is_video = suffix in VIDEO_EXTENSIONS or mime.startswith('video/')
    print(f"[optimize] filename={f.filename!r}  suffix={suffix!r}  mime={mime!r}  is_video={is_video}")

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_in:
        tmp_in_path = tmp_in.name
        f.save(tmp_in_path)

    if is_video:
        # Keep original container/extension, copy video stream, re-encode audio only
        out_suffix = suffix
        out_mime = 'video/mp4' if suffix in {'.mp4', '.m4v', '.mov'} else 'video/webm'
    else:
        out_suffix = '.mp3'
        out_mime = 'audio/mpeg'

    tmp_out_path = tmp_in_path.replace(suffix, f'_optimized{out_suffix}')

    try:
        if is_video:
            cmd = [
                'ffmpeg', '-y',
                '-i', tmp_in_path,
                '-c:v', 'copy',          # pass video stream through unchanged
                '-c:a', 'aac',
                '-b:a', f'{bitrate}k',
                '-af', f'loudnorm=I={lufs}:LRA=11:TP=-1.5',
                '-ar', '44100',
                '-ac', '2',
                tmp_out_path,
            ]
        else:
            cmd = [
                'ffmpeg', '-y',
                '-i', tmp_in_path,
                '-b:a', f'{bitrate}k',
                '-af', f'loudnorm=I={lufs}:LRA=11:TP=-1.5',
                '-ar', '44100',
                '-ac', '2',
                tmp_out_path,
            ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            return jsonify({'error': 'FFmpeg processing failed', 'details': result.stderr}), 500

        base_name = os.path.splitext(f.filename)[0]
        return send_file(
            tmp_out_path,
            mimetype=out_mime,
            as_attachment=True,
            download_name=f'optimized_{base_name}{out_suffix}',
        )

    finally:
        if os.path.exists(tmp_in_path):
            os.unlink(tmp_in_path)


if __name__ == '__main__':
    app.run(debug=True, port=5000)
