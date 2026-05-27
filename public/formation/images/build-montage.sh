#!/bin/bash
set -e

cd /home/ubuntu/jadomi/public/formation/images

MOUTH_MAX="1779819378536-chemin_scan_maxillaire.mp4"
MOUTH_MAN="1779819334939-chemin_scan_mandibulaire.mp4"
MOUTH_OCC="1779819305696-chemin_scan_empreinte_occlusion.mp4"
PC="1779819294035-chemin_scan_ecran_pc.mp4"
FONT="/usr/local/share/fonts/jadomi/Inter-700.ttf"
FONTL="/usr/local/share/fonts/jadomi/Inter-400.ttf"

# Backup old splits
mkdir -p old-splits-v1 2>/dev/null || true
mv split-*.mp4 old-splits-v1/ 2>/dev/null || true

echo "========================================="
echo "SEGMENT 1: MAXILLAIRE (99s)"
echo "Bouche 0:00->1:39 | PC PiP apparait a t=26s"
echo "========================================="
ffmpeg -y -hide_banner -loglevel warning -stats \
  -t 99 -i "$MOUTH_MAX" \
  -ss 6 -t 73 -i "$PC" \
  -filter_complex "
    [0:v]scale=1280:720,setsar=1[main];
    [1:v]scale=420:236:force_original_aspect_ratio=decrease,
         pad=420:236:(ow-iw)/2:(oh-ih)/2:color=0x08080D,
         pad=426:242:3:3:color=0x4dd0e1,
         fade=t=in:st=0:d=0.8,
         setpts=PTS+26/TB[pip];
    [main][pip]overlay=x=840:y=458:eof_action=pass:repeatlast=0,
    drawtext=fontfile=${FONT}:text='1 | MAXILLAIRE':fontcolor=white:fontsize=26:x=30:y=22:shadowcolor=black@0.6:shadowx=2:shadowy=2,
    drawtext=fontfile=${FONTL}:text='Occlusale - Palatine - Vestibulaire - Zones manquantes':fontcolor=0x4dd0e1@0.5:fontsize=13:x=30:y=54,
    drawtext=fontfile=${FONTL}:text='VUE ECRAN':fontcolor=white@0.6:fontsize=11:x=990:y=445:enable='gte(t\,27)',
    fade=t=in:st=0:d=0.5,
    fade=t=out:st=98:d=1
    [out]
  " -map "[out]" -an -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p montage-seg1.mp4
echo "SEG1 OK"

echo "========================================="
echo "SEGMENT 2: MANDIBULE (67s)"
echo "Bouche 0:00->1:07 | PC PiP apparait a t=6s"
echo "========================================="
ffmpeg -y -hide_banner -loglevel warning -stats \
  -t 67 -i "$MOUTH_MAN" \
  -ss 115 -t 61 -i "$PC" \
  -filter_complex "
    [0:v]scale=1280:720,setsar=1[main];
    [1:v]scale=420:236:force_original_aspect_ratio=decrease,
         pad=420:236:(ow-iw)/2:(oh-ih)/2:color=0x08080D,
         pad=426:242:3:3:color=0x4dd0e1,
         fade=t=in:st=0:d=0.8,
         setpts=PTS+6/TB[pip];
    [main][pip]overlay=x=840:y=458:eof_action=pass:repeatlast=0,
    drawtext=fontfile=${FONT}:text='2 | MANDIBULE':fontcolor=white:fontsize=26:x=30:y=22:shadowcolor=black@0.6:shadowx=2:shadowy=2,
    drawtext=fontfile=${FONTL}:text='Occlusale - Linguale - Vestibulaire - Combler les trous':fontcolor=0x4dd0e1@0.5:fontsize=13:x=30:y=54,
    drawtext=fontfile=${FONTL}:text='VUE ECRAN':fontcolor=white@0.6:fontsize=11:x=990:y=445:enable='gte(t\,7)',
    fade=t=in:st=0:d=0.5,
    fade=t=out:st=66:d=1
    [out]
  " -map "[out]" -an -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p montage-seg2.mp4
echo "SEG2 OK"

echo "========================================="
echo "SEGMENT 3: OCCLUSION (22s)"
echo "Bouche 0:00->0:22 | PC PiP apparait a t=2s"
echo "========================================="
ffmpeg -y -hide_banner -loglevel warning -stats \
  -t 22 -i "$MOUTH_OCC" \
  -ss 211 -t 18 -i "$PC" \
  -filter_complex "
    [0:v]scale=1280:720,setsar=1[main];
    [1:v]scale=420:236:force_original_aspect_ratio=decrease,
         pad=420:236:(ow-iw)/2:(oh-ih)/2:color=0x08080D,
         pad=426:242:3:3:color=0x4dd0e1,
         fade=t=in:st=0:d=0.8,
         setpts=PTS+2/TB[pip];
    [main][pip]overlay=x=840:y=458:eof_action=pass:repeatlast=0,
    drawtext=fontfile=${FONT}:text='3 | OCCLUSION':fontcolor=white:fontsize=26:x=30:y=22:shadowcolor=black@0.6:shadowx=2:shadowy=2,
    drawtext=fontfile=${FONTL}:text='Gauche - Match - Droite - Match':fontcolor=0x4dd0e1@0.5:fontsize=13:x=30:y=54,
    drawtext=fontfile=${FONTL}:text='VUE ECRAN':fontcolor=white@0.6:fontsize=11:x=990:y=445:enable='gte(t\,3)',
    fade=t=in:st=0:d=0.5,
    fade=t=out:st=21:d=1
    [out]
  " -map "[out]" -an -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p montage-seg3.mp4
echo "SEG3 OK"

echo "========================================="
echo "SEGMENT 4: VERIFICATION (31s)"
echo "PC plein ecran 5:26->5:57"
echo "========================================="
ffmpeg -y -hide_banner -loglevel warning -stats \
  -ss 326 -t 31 -i "$PC" \
  -filter_complex "
    [0:v]scale=1280:720:force_original_aspect_ratio=decrease,
         pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x08080D,setsar=1,
    drawtext=fontfile=${FONT}:text='VERIFICATION':fontcolor=0x66bb6a:fontsize=30:x=30:y=22:shadowcolor=black@0.6:shadowx=2:shadowy=2,
    drawtext=fontfile=${FONTL}:text='Occlusion - Mandibule - Maxillaire':fontcolor=white@0.6:fontsize=14:x=30:y=58,
    fade=t=in:st=0:d=0.5,
    fade=t=out:st=30:d=1
    [out]
  " -map "[out]" -an -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p montage-seg4.mp4
echo "SEG4 OK"

echo "========================================="
echo "SEGMENT 5: RESULTAT FINAL (10s)"
echo "PC plein ecran 2:58->3:08 — manipulation empreinte 3D"
echo "========================================="
ffmpeg -y -hide_banner -loglevel warning -stats \
  -ss 178 -t 10 -i "$PC" \
  -filter_complex "
    [0:v]scale=1280:720:force_original_aspect_ratio=decrease,
         pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x08080D,setsar=1,
    drawtext=fontfile=${FONT}:text='RESULTAT FINAL':fontcolor=0xC9A84C:fontsize=30:x=30:y=22:shadowcolor=black@0.6:shadowx=2:shadowy=2,
    drawtext=fontfile=${FONTL}:text='Empreinte 3D complete — Correction IA instantanee':fontcolor=white@0.6:fontsize=14:x=30:y=58,
    fade=t=in:st=0:d=0.5,
    fade=t=out:st=9:d=1
    [out]
  " -map "[out]" -an -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p montage-seg5.mp4
echo "SEG5 OK"

echo "========================================="
echo "CONCATENATION FINALE"
echo "========================================="
cat > /tmp/concat-montage.txt << 'CONCAT'
file '/home/ubuntu/jadomi/public/formation/images/montage-seg1.mp4'
file '/home/ubuntu/jadomi/public/formation/images/montage-seg2.mp4'
file '/home/ubuntu/jadomi/public/formation/images/montage-seg3.mp4'
file '/home/ubuntu/jadomi/public/formation/images/montage-seg4.mp4'
file '/home/ubuntu/jadomi/public/formation/images/montage-seg5.mp4'
CONCAT

ffmpeg -y -hide_banner -loglevel warning -stats \
  -f concat -safe 0 -i /tmp/concat-montage.txt \
  -c copy montage-scan-complet.mp4

echo ""
echo "========================================="
echo "MONTAGE TERMINE !"
echo "========================================="
ls -lh montage-seg*.mp4 montage-scan-complet.mp4
echo ""
TOTAL=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 montage-scan-complet.mp4 2>/dev/null)
echo "Duree totale: ${TOTAL}s"
echo "========================================="
