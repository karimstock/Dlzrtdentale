#!/bin/bash
set -e

cd /home/ubuntu/jadomi/public/formation/images

MOUTH_MAX="1779819378536-chemin_scan_maxillaire.mp4"
MOUTH_MAN="1779819334939-chemin_scan_mandibulaire.mp4"
MOUTH_OCC="1779819305696-chemin_scan_empreinte_occlusion.mp4"
PC="1779819294035-chemin_scan_ecran_pc.mp4"
FONT="/usr/local/share/fonts/jadomi/Inter-700.ttf"
FONTL="/usr/local/share/fonts/jadomi/Inter-400.ttf"

# Layout 1280x720 :
# - Fond = video bouche scaled+crop plein ecran + GROS FLOU + assombri
# - Centre = video bouche portrait nette (405x720)
# - Droite sur le flou = fenetre PC (430x222) + labels

echo "========================================="
echo "SEGMENT 1: MAXILLAIRE (99s)"
echo "========================================="
ffmpeg -y -hide_banner -loglevel warning -stats \
  -t 99 -i "$MOUTH_MAX" \
  -ss 6 -t 73 -i "$PC" \
  -filter_complex "
    [0:v]split=2[sharp][blur_src];
    [blur_src]scale=1280:-1,crop=1280:720,gblur=sigma=30,eq=brightness=-0.2:saturation=0.6[bg];
    [sharp]scale=405:720,setsar=1[mouth];
    [1:v]scale=430:222:force_original_aspect_ratio=decrease,
         pad=430:222:(ow-iw)/2:(oh-ih)/2:color=0x08080D,
         pad=436:228:3:3:color=0x4dd0e1,
         fade=t=in:st=0:d=0.8,
         setpts=PTS+26/TB[pip];
    [bg][mouth]overlay=(1280-405)/2:0[t1];
    [t1][pip]overlay=x=830:y=30:eof_action=pass:repeatlast=0[t2];
    [t2]drawtext=fontfile=${FONT}:text='1 | MAXILLAIRE':fontcolor=white:fontsize=22:x=830:y=275:shadowcolor=black@0.8:shadowx=2:shadowy=2,
    drawtext=fontfile=${FONTL}:text='Occlusale':fontcolor=0x4dd0e1:fontsize=13:x=830:y=305,
    drawtext=fontfile=${FONTL}:text='Palatine':fontcolor=0x4dd0e1@0.7:fontsize=13:x=830:y=325,
    drawtext=fontfile=${FONTL}:text='Vestibulaire':fontcolor=0x4dd0e1@0.7:fontsize=13:x=830:y=345,
    drawtext=fontfile=${FONTL}:text='Zones manquantes':fontcolor=0x4dd0e1@0.7:fontsize=13:x=830:y=365,
    drawtext=fontfile=${FONTL}:text='VUE ECRAN':fontcolor=white@0.6:fontsize=10:x=1000:y=18:enable='gte(t\,27)',
    fade=t=in:st=0:d=0.5,
    fade=t=out:st=98:d=1
    [out]
  " -map "[out]" -an -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p montage-v3-seg1.mp4
echo "SEG1 OK"

echo "========================================="
echo "SEGMENT 2: MANDIBULE (67s)"
echo "========================================="
ffmpeg -y -hide_banner -loglevel warning -stats \
  -t 67 -i "$MOUTH_MAN" \
  -ss 115 -t 61 -i "$PC" \
  -filter_complex "
    [0:v]split=2[sharp][blur_src];
    [blur_src]scale=1280:-1,crop=1280:720,gblur=sigma=30,eq=brightness=-0.2:saturation=0.6[bg];
    [sharp]scale=405:720,setsar=1[mouth];
    [1:v]scale=430:222:force_original_aspect_ratio=decrease,
         pad=430:222:(ow-iw)/2:(oh-ih)/2:color=0x08080D,
         pad=436:228:3:3:color=0x4dd0e1,
         fade=t=in:st=0:d=0.8,
         setpts=PTS+6/TB[pip];
    [bg][mouth]overlay=(1280-405)/2:0[t1];
    [t1][pip]overlay=x=830:y=30:eof_action=pass:repeatlast=0[t2];
    [t2]drawtext=fontfile=${FONT}:text='2 | MANDIBULE':fontcolor=white:fontsize=22:x=830:y=275:shadowcolor=black@0.8:shadowx=2:shadowy=2,
    drawtext=fontfile=${FONTL}:text='Occlusale':fontcolor=0x4dd0e1:fontsize=13:x=830:y=305,
    drawtext=fontfile=${FONTL}:text='Linguale':fontcolor=0x4dd0e1@0.7:fontsize=13:x=830:y=325,
    drawtext=fontfile=${FONTL}:text='Vestibulaire':fontcolor=0x4dd0e1@0.7:fontsize=13:x=830:y=345,
    drawtext=fontfile=${FONTL}:text='Combler les trous':fontcolor=0x4dd0e1@0.7:fontsize=13:x=830:y=365,
    drawtext=fontfile=${FONTL}:text='VUE ECRAN':fontcolor=white@0.6:fontsize=10:x=1000:y=18:enable='gte(t\,7)',
    fade=t=in:st=0:d=0.5,
    fade=t=out:st=66:d=1
    [out]
  " -map "[out]" -an -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p montage-v3-seg2.mp4
echo "SEG2 OK"

echo "========================================="
echo "SEGMENT 3: OCCLUSION (22s)"
echo "========================================="
ffmpeg -y -hide_banner -loglevel warning -stats \
  -t 22 -i "$MOUTH_OCC" \
  -ss 211 -t 18 -i "$PC" \
  -filter_complex "
    [0:v]split=2[sharp][blur_src];
    [blur_src]scale=1280:-1,crop=1280:720,gblur=sigma=30,eq=brightness=-0.2:saturation=0.6[bg];
    [sharp]scale=405:720,setsar=1[mouth];
    [1:v]scale=430:222:force_original_aspect_ratio=decrease,
         pad=430:222:(ow-iw)/2:(oh-ih)/2:color=0x08080D,
         pad=436:228:3:3:color=0x4dd0e1,
         fade=t=in:st=0:d=0.8,
         setpts=PTS+2/TB[pip];
    [bg][mouth]overlay=(1280-405)/2:0[t1];
    [t1][pip]overlay=x=830:y=30:eof_action=pass:repeatlast=0[t2];
    [t2]drawtext=fontfile=${FONT}:text='3 | OCCLUSION':fontcolor=white:fontsize=22:x=830:y=275:shadowcolor=black@0.8:shadowx=2:shadowy=2,
    drawtext=fontfile=${FONTL}:text='Gauche - Match':fontcolor=0x4dd0e1:fontsize=13:x=830:y=305,
    drawtext=fontfile=${FONTL}:text='Droite - Match':fontcolor=0x4dd0e1@0.7:fontsize=13:x=830:y=325,
    drawtext=fontfile=${FONTL}:text='VUE ECRAN':fontcolor=white@0.6:fontsize=10:x=1000:y=18:enable='gte(t\,3)',
    fade=t=in:st=0:d=0.5,
    fade=t=out:st=21:d=1
    [out]
  " -map "[out]" -an -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p montage-v3-seg3.mp4
echo "SEG3 OK"

echo "========================================="
echo "SEGMENT 4: VERIFICATION (31s)"
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
  " -map "[out]" -an -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p montage-v3-seg4.mp4
echo "SEG4 OK"

echo "========================================="
echo "SEGMENT 5: RESULTAT FINAL (10s)"
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
  " -map "[out]" -an -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p montage-v3-seg5.mp4
echo "SEG5 OK"

echo "========================================="
echo "CONCATENATION FINALE"
echo "========================================="
cat > /tmp/concat-montage-v3.txt << 'CONCAT'
file '/home/ubuntu/jadomi/public/formation/images/montage-v3-seg1.mp4'
file '/home/ubuntu/jadomi/public/formation/images/montage-v3-seg2.mp4'
file '/home/ubuntu/jadomi/public/formation/images/montage-v3-seg3.mp4'
file '/home/ubuntu/jadomi/public/formation/images/montage-v3-seg4.mp4'
file '/home/ubuntu/jadomi/public/formation/images/montage-v3-seg5.mp4'
CONCAT

ffmpeg -y -hide_banner -loglevel warning -stats \
  -f concat -safe 0 -i /tmp/concat-montage-v3.txt \
  -c copy montage-scan-complet.mp4

echo ""
echo "========================================="
echo "MONTAGE V3 TERMINE !"
echo "========================================="
ls -lh montage-v3-seg*.mp4 montage-scan-complet.mp4
TOTAL=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 montage-scan-complet.mp4 2>/dev/null)
echo "Duree totale: ${TOTAL}s"
echo "========================================="
