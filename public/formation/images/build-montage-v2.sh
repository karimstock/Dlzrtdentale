#!/bin/bash
set -e

cd /home/ubuntu/jadomi/public/formation/images

MOUTH_MAX="1779819378536-chemin_scan_maxillaire.mp4"
MOUTH_MAN="1779819334939-chemin_scan_mandibulaire.mp4"
MOUTH_OCC="1779819305696-chemin_scan_empreinte_occlusion.mp4"
PC="1779819294035-chemin_scan_ecran_pc.mp4"
FONT="/usr/local/share/fonts/jadomi/Inter-700.ttf"
FONTL="/usr/local/share/fonts/jadomi/Inter-400.ttf"

# Layout: 1280x720
# Bouche portrait (gauche) : 405x720 (9:16 ratio)
# PC paysage (droite) : ~500x258 flottant en haut à droite
# Le reste = fond noir avec labels

echo "========================================="
echo "SEGMENT 1: MAXILLAIRE (99s)"
echo "Bouche portrait 0:00->1:39 | PC PiP a t=26s"
echo "========================================="
ffmpeg -y -hide_banner -loglevel warning -stats \
  -t 99 -i "$MOUTH_MAX" \
  -ss 6 -t 73 -i "$PC" \
  -filter_complex "
    color=c=0x08080D:s=1280x720:d=99[bg];
    [0:v]scale=405:720,setsar=1[mouth];
    [1:v]scale=480:248:force_original_aspect_ratio=decrease,
         pad=480:248:(ow-iw)/2:(oh-ih)/2:color=0x08080D,
         pad=486:254:3:3:color=0x4dd0e1,
         fade=t=in:st=0:d=0.8,
         setpts=PTS+26/TB[pip];
    [bg][mouth]overlay=30:0:eof_action=endall[t1];
    [t1][pip]overlay=x=760:y=30:eof_action=pass:repeatlast=0[t2];
    [t2]drawtext=fontfile=${FONT}:text='1 | MAXILLAIRE':fontcolor=white:fontsize=24:x=500:y=320:shadowcolor=black@0.6:shadowx=2:shadowy=2,
    drawtext=fontfile=${FONTL}:text='Occlusale':fontcolor=0x4dd0e1:fontsize=14:x=500:y=355,
    drawtext=fontfile=${FONTL}:text='Palatine':fontcolor=0x4dd0e1@0.7:fontsize=14:x=500:y=380,
    drawtext=fontfile=${FONTL}:text='Vestibulaire':fontcolor=0x4dd0e1@0.7:fontsize=14:x=500:y=405,
    drawtext=fontfile=${FONTL}:text='Zones manquantes':fontcolor=0x4dd0e1@0.7:fontsize=14:x=500:y=430,
    drawtext=fontfile=${FONTL}:text='VUE ECRAN':fontcolor=white@0.5:fontsize=10:x=960:y=18:enable='gte(t\,27)',
    drawtext=fontfile=${FONTL}:text='Scialytique eteint - Sechage - Aspiration':fontcolor=white@0.3:fontsize=11:x=500:y=480,
    drawtext=fontfile=${FONTL}:text='Regard sur ecran\, pas en bouche':fontcolor=white@0.3:fontsize=11:x=500:y=500,
    fade=t=in:st=0:d=0.5,
    fade=t=out:st=98:d=1
    [out]
  " -map "[out]" -an -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p montage-v2-seg1.mp4
echo "SEG1 OK"

echo "========================================="
echo "SEGMENT 2: MANDIBULE (67s)"
echo "Bouche portrait 0:00->1:07 | PC PiP a t=6s"
echo "========================================="
ffmpeg -y -hide_banner -loglevel warning -stats \
  -t 67 -i "$MOUTH_MAN" \
  -ss 115 -t 61 -i "$PC" \
  -filter_complex "
    color=c=0x08080D:s=1280x720:d=67[bg];
    [0:v]scale=405:720,setsar=1[mouth];
    [1:v]scale=480:248:force_original_aspect_ratio=decrease,
         pad=480:248:(ow-iw)/2:(oh-ih)/2:color=0x08080D,
         pad=486:254:3:3:color=0x4dd0e1,
         fade=t=in:st=0:d=0.8,
         setpts=PTS+6/TB[pip];
    [bg][mouth]overlay=30:0:eof_action=endall[t1];
    [t1][pip]overlay=x=760:y=30:eof_action=pass:repeatlast=0[t2];
    [t2]drawtext=fontfile=${FONT}:text='2 | MANDIBULE':fontcolor=white:fontsize=24:x=500:y=320:shadowcolor=black@0.6:shadowx=2:shadowy=2,
    drawtext=fontfile=${FONTL}:text='Occlusale':fontcolor=0x4dd0e1:fontsize=14:x=500:y=355,
    drawtext=fontfile=${FONTL}:text='Linguale':fontcolor=0x4dd0e1@0.7:fontsize=14:x=500:y=380,
    drawtext=fontfile=${FONTL}:text='Vestibulaire':fontcolor=0x4dd0e1@0.7:fontsize=14:x=500:y=405,
    drawtext=fontfile=${FONTL}:text='Combler les trous':fontcolor=0x4dd0e1@0.7:fontsize=14:x=500:y=430,
    drawtext=fontfile=${FONTL}:text='VUE ECRAN':fontcolor=white@0.5:fontsize=10:x=960:y=18:enable='gte(t\,7)',
    drawtext=fontfile=${FONTL}:text='Sechage obligatoire':fontcolor=white@0.3:fontsize=11:x=500:y=480,
    drawtext=fontfile=${FONTL}:text='Aspiration en bouche':fontcolor=white@0.3:fontsize=11:x=500:y=500,
    fade=t=in:st=0:d=0.5,
    fade=t=out:st=66:d=1
    [out]
  " -map "[out]" -an -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p montage-v2-seg2.mp4
echo "SEG2 OK"

echo "========================================="
echo "SEGMENT 3: OCCLUSION (22s)"
echo "Bouche portrait 0:00->0:22 | PC PiP a t=2s"
echo "========================================="
ffmpeg -y -hide_banner -loglevel warning -stats \
  -t 22 -i "$MOUTH_OCC" \
  -ss 211 -t 18 -i "$PC" \
  -filter_complex "
    color=c=0x08080D:s=1280x720:d=22[bg];
    [0:v]scale=405:720,setsar=1[mouth];
    [1:v]scale=480:248:force_original_aspect_ratio=decrease,
         pad=480:248:(ow-iw)/2:(oh-ih)/2:color=0x08080D,
         pad=486:254:3:3:color=0x4dd0e1,
         fade=t=in:st=0:d=0.8,
         setpts=PTS+2/TB[pip];
    [bg][mouth]overlay=30:0:eof_action=endall[t1];
    [t1][pip]overlay=x=760:y=30:eof_action=pass:repeatlast=0[t2];
    [t2]drawtext=fontfile=${FONT}:text='3 | OCCLUSION':fontcolor=white:fontsize=24:x=500:y=320:shadowcolor=black@0.6:shadowx=2:shadowy=2,
    drawtext=fontfile=${FONTL}:text='Gauche - Match':fontcolor=0x4dd0e1:fontsize=14:x=500:y=355,
    drawtext=fontfile=${FONTL}:text='Droite - Match':fontcolor=0x4dd0e1@0.7:fontsize=14:x=500:y=380,
    drawtext=fontfile=${FONTL}:text='VUE ECRAN':fontcolor=white@0.5:fontsize=10:x=960:y=18:enable='gte(t\,3)',
    fade=t=in:st=0:d=0.5,
    fade=t=out:st=21:d=1
    [out]
  " -map "[out]" -an -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p montage-v2-seg3.mp4
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
  " -map "[out]" -an -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p montage-v2-seg4.mp4
echo "SEG4 OK"

echo "========================================="
echo "SEGMENT 5: RESULTAT FINAL (10s)"
echo "PC plein ecran 2:58->3:08"
echo "========================================="
ffmpeg -y -hide_banner -loglevel warning -stats \
  -ss 178 -t 10 -i "$PC" \
  -filter_complex "
    [0:v]scale=1280:720:force_original_aspect_ratio=decrease,
         pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x08080D,setsar=1,
    drawtext=fontfile=${FONT}:text='RESULTAT FINAL':fontcolor=0xC9A84C:fontsize=30:x=30:y=22:shadowcolor=black@0.6:shadowx=2:shadowy=2,
    drawtext=fontfile=${FONTL}:text='Empreinte 3D complete - Correction IA instantanee':fontcolor=white@0.6:fontsize=14:x=30:y=58,
    fade=t=in:st=0:d=0.5,
    fade=t=out:st=9:d=1
    [out]
  " -map "[out]" -an -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p montage-v2-seg5.mp4
echo "SEG5 OK"

echo "========================================="
echo "CONCATENATION FINALE"
echo "========================================="
cat > /tmp/concat-montage-v2.txt << 'CONCAT'
file '/home/ubuntu/jadomi/public/formation/images/montage-v2-seg1.mp4'
file '/home/ubuntu/jadomi/public/formation/images/montage-v2-seg2.mp4'
file '/home/ubuntu/jadomi/public/formation/images/montage-v2-seg3.mp4'
file '/home/ubuntu/jadomi/public/formation/images/montage-v2-seg4.mp4'
file '/home/ubuntu/jadomi/public/formation/images/montage-v2-seg5.mp4'
CONCAT

ffmpeg -y -hide_banner -loglevel warning -stats \
  -f concat -safe 0 -i /tmp/concat-montage-v2.txt \
  -c copy montage-scan-complet.mp4

echo ""
echo "========================================="
echo "MONTAGE V2 TERMINE !"
echo "========================================="
ls -lh montage-v2-seg*.mp4 montage-scan-complet.mp4
TOTAL=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 montage-scan-complet.mp4 2>/dev/null)
echo "Duree totale: ${TOTAL}s"
echo "========================================="
