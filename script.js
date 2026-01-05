// ==========================================
// FFMPEG - WEBM TO MP4 CONVERSION (OPTIMIZED)
// ==========================================
let ffmpegLoaded = false;
let ffmpegInstance = null;

async function loadFFmpeg() {
    if (ffmpegLoaded && ffmpegInstance) {
        return ffmpegInstance;
    }
    
    try {
        const { FFmpeg } = FFmpegWASM;
        const ffmpeg = new FFmpeg();
        
        // Load with progress logging
        await ffmpeg.load({
            coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
            wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm'
        });
        
        ffmpegLoaded = true;
        ffmpegInstance = ffmpeg;
        console.log('✅ FFmpeg loaded successfully');
        return ffmpeg;
    } catch (err) {
        console.error('FFmpeg load error:', err);
        throw err;
    }
}

async function convertWebMtoMP4(webmBlob, statusCallback) {
    try {
        statusCallback('Loading converter...');
        const ffmpeg = await loadFFmpeg();
        const { fetchFile } = FFmpegUtil;
        
        statusCallback('Converting to MP4...');
        console.log('Starting conversion...');
        
        // Write input file
        await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob));
        console.log('Input file written');
        
        // Convert with optimized settings
        await ffmpeg.exec([
            '-i', 'input.webm',
            '-c:v', 'libx264',      // H.264 codec
            '-preset', 'ultrafast',  // Fastest encoding
            '-crf', '28',            // Lower quality = faster
            '-pix_fmt', 'yuv420p',   // iPhone compatible
            '-movflags', '+faststart', // Web streaming
            'output.mp4'
        ]);
        console.log('Conversion complete');
        
        // Read output
        const data = await ffmpeg.readFile('output.mp4');
        const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
        console.log('MP4 size:', (mp4Blob.size / 1024 / 1024).toFixed(2), 'MB');
        
        // Cleanup
        await ffmpeg.deleteFile('input.webm');
        await ffmpeg.deleteFile('output.mp4');
        
        statusCallback('Conversion complete!');
        return mp4Blob;
        
    } catch (err) {
        console.error('Conversion error:', err);
        statusCallback('Conversion failed!');
        return null;
    }
}

// Global variables
let uploadedPFP = null;
let formData = {};
let recordedWebMBlob = null;
let recordedFrames = [];
let canvasContext = null;
let canvasElement = null;
let pfpImage = null;

// ==========================================
// PFP UPLOAD
// ==========================================
document.getElementById('pfpPreview').addEventListener('click', function() {
    document.getElementById('pfpInput').click();
});

document.getElementById('pfpInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            uploadedPFP = event.target.result;
            const img = document.getElementById('pfpImage');
            img.src = uploadedPFP;
            img.style.display = 'block';
            document.querySelector('.pfp-placeholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
    }
});

// ==========================================
// FORM SUBMIT
// ==========================================
document.getElementById('communityForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    if (!uploadedPFP) {
        alert('Please upload a profile picture!');
        return;
    }
    
    formData = {
        username: document.getElementById('username').value,
        region: document.getElementById('region').value,
        magnitude: document.getElementById('magnitude').value,
        pfp: uploadedPFP
    };
    
    // Switch to recording page
    document.getElementById('page1').classList.remove('active');
    document.getElementById('page2').classList.add('active');
    
    // Start video generation
    setTimeout(() => {
        generateVideo(formData);
    }, 500);
});

// ==========================================
// VIDEO GENERATION (CANVAS RECORDING - FIXED)
// ==========================================
async function generateVideo(data) {
    const canvas = document.getElementById('recordCanvas');
    const ctx = canvas.getContext('2d');
    
    // Store globally for GIF generation
    canvasElement = canvas;
    canvasContext = ctx;
    recordedFrames = [];
    
    // Set canvas size
    const canvasWidth = 1920;
    const canvasHeight = 1080;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    // Load PFP image
    const pfpImg = await loadImage(data.pfp);
    pfpImage = pfpImg; // Store for GIF
    
    // Recording settings
    const fps = 30;
    const duration = 14; // 12 seconds
    const totalFrames = fps * duration;
    const frameInterval = 1000 / fps; // 33.33ms per frame
    
    // Setup MediaRecorder with canvas stream
    const stream = canvas.captureStream(fps);
    const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 8000000 // 8 Mbps
    });
    
    const chunks = [];
    
    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
            chunks.push(e.data);
            console.log('Chunk received:', e.data.size, 'bytes');
        }
    };
    
    mediaRecorder.onstop = () => {
        console.log('Recording stopped. Total chunks:', chunks.length);
        const blob = new Blob(chunks, { type: 'video/webm' });
        console.log('Video blob size:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
        
        // Store WebM blob globally
        recordedWebMBlob = blob;
        
        // Show download buttons
        document.getElementById('statusText').textContent = 'Video complete!';
        document.getElementById('downloadButtons').style.display = 'flex';
    };
    


    // Start recording
    mediaRecorder.start();
    console.log('Recording started');
    
    const startTime = Date.now();
    let currentFrame = 0;
    let lastFrameTime = Date.now();
    
    // Use setInterval with PRECISE TIMING + MOBILE FRAME PACING
    const renderInterval = setInterval(() => {
        const now = Date.now();
        const elapsedTime = (now - startTime) / 1000;
        const expectedFrame = Math.floor(elapsedTime * fps);
        
        // MOBILE FIX: Enforce minimum time between frames
        const timeSinceLastFrame = now - lastFrameTime;
        const minFrameTime = frameInterval * 0.9; // 30ms minimum
        
        if (timeSinceLastFrame < minFrameTime) {
            return; // Skip this tick - too fast!
        }
        
        // Stop at target duration
        if (elapsedTime >= duration) {
            clearInterval(renderInterval);
            console.log(`Done! ${elapsedTime.toFixed(2)}s, ${currentFrame} frames`);
            setTimeout(() => mediaRecorder.stop(), 200);
            return;
        }
        
        // Don't go ahead
        if (currentFrame > expectedFrame) {
            return;
        }
        
        // Render frames (max 3 per tick on mobile)
        let framesRendered = 0;
        const maxFramesPerTick = 3;
        
        while (currentFrame <= expectedFrame && currentFrame < totalFrames && framesRendered < maxFramesPerTick) {
            const progress = currentFrame / totalFrames;
            document.getElementById('progressFill').style.width = (progress * 100) + '%';
            
            ctx.fillStyle = '#1a1820';
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            
            if (currentFrame < fps * 8) {
                renderTerminalPhase(ctx, canvasWidth, canvasHeight, currentFrame, data);
            } else if (currentFrame < fps * 9) {
                const fadeFrame = currentFrame - (fps * 8);
                renderFadePhase(ctx, canvasWidth, canvasHeight, fadeFrame, fps, data);
            } else {
                const pfpFrame = currentFrame - (fps * 9);
                renderPFPPhase(ctx, canvasWidth, canvasHeight, pfpImg, pfpFrame, fps);
            }
            
            if (currentFrame % 30 === 0) {
                console.log(`Frame ${currentFrame}/${totalFrames} (${elapsedTime.toFixed(2)}s)`);
            }
            
            currentFrame++;
            framesRendered++;
        }
        
        lastFrameTime = now;
    }, frameInterval);

}

// ==========================================
// PHASE 1: TERMINAL TYPING
// ==========================================
function renderTerminalPhase(ctx, width, height, frame, data) {
    // Draw terminal background with gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#2d2a35');
    gradient.addColorStop(0.6, '#1a1820');
    gradient.addColorStop(1, '#0f0e12');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Terminal header
    drawTerminalHeader(ctx, width);
    
    // Terminal text lines with typing effect (FIXED TIMING)
    const lines = [
        { frame: 15, text: '// Initializing SEISMIC System...', color: '#6a9955' },
        { frame: 40, text: 'const blockchain = initSeismic();', color: '#dcdcaa' },
        { frame: 60, text: '✓ Privacy-enabled blockchain active', color: '#4ec9b0' },
        { frame: 75, text: '', color: '#d4d4d4' },
        { frame: 85, text: '// Loading member profile...', color: '#6a9955' },
        { frame: 105, text: 'const member = {', color: '#dcdcaa' },
        { frame: 125, text: `  username: "${data.username}",`, color: '#ce9178' },
        { frame: 145, text: `  region: "${data.region}",`, color: '#ce9178' },
        { frame: 165, text: `  magnitude: "${data.magnitude}"`, color: '#ce9178' },
        { frame: 180, text: '};', color: '#dcdcaa' },
        { frame: 190, text: '', color: '#d4d4d4' },
        { frame: 200, text: '// Verifying credentials...', color: '#6a9955' },
        { frame: 215, text: 'const verification = verify(member);', color: '#dcdcaa' },
        { frame: 225, text: '✓ Member verified', color: '#4ec9b0' },
        { frame: 230, text: '', color: '#d4d4d4' },
        { frame: 235, text: 'console.log("Welcome to SEISMIC");', color: '#9cdcfe' },
        { frame: 238, text: '// Building products users can trust', color: '#6a9955' }
    ];
    
    ctx.font = '34px "Fira Code", monospace';
    ctx.textAlign = 'left';
    
    let yPos = 180;
    lines.forEach(line => {
        if (frame >= line.frame) {
            ctx.fillStyle = line.color;
            ctx.fillText(line.text, 100, yPos);
        }
        yPos += 40;
    });
}

// ==========================================
// PHASE 2: FADE TRANSITION
// ==========================================
function renderFadePhase(ctx, width, height, frame, fps, data) {
    const progress = frame / fps; // 0 to 1
    
    // First draw terminal (fading out)
    renderTerminalPhase(ctx, width, height, fps * 8 - 1, data);
    
    // Then fade to black over it
    ctx.fillStyle = `rgba(26, 24, 32, ${progress})`;
    ctx.fillRect(0, 0, width, height);
}

// ==========================================
// PHASE 3: PFP + CODE
// ==========================================
function renderPFPPhase(ctx, width, height, pfpImg, frame, fps) {
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#2d2a35');
    gradient.addColorStop(0.6, '#1a1820');
    gradient.addColorStop(1, '#0f0e12');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Terminal header
    drawTerminalHeader(ctx, width);
    
    // PFP FILLS ENTIRE TERMINAL (FULL SIZE - NO MARGINS!)
    const headerHeight = 130; // Header space
    const pfpX = 0; // No left margin
    const pfpY = headerHeight; // Start right after header
    const pfpWidth = width; // FULL WIDTH
    const pfpHeight = height - headerHeight; // FULL HEIGHT
    
    // Draw PFP with cover fit (like CSS object-fit: cover)
    ctx.save();
    ctx.globalAlpha = Math.min(frame / 30, 1); // Fade in over 1 second
    
    // Calculate scale to cover entire area
    const imgRatio = pfpImg.width / pfpImg.height;
    const areaRatio = pfpWidth / pfpHeight;
    
    let drawWidth, drawHeight, drawX, drawY;
    
    if (imgRatio > areaRatio) {
        // Image wider than area - fit height
        drawHeight = pfpHeight;
        drawWidth = pfpHeight * imgRatio;
        drawX = pfpX - (drawWidth - pfpWidth) / 2; // Center horizontally
        drawY = pfpY;
    } else {
        // Image taller than area - fit width
        drawWidth = pfpWidth;
        drawHeight = pfpWidth / imgRatio;
        drawX = pfpX;
        drawY = pfpY - (drawHeight - pfpHeight) / 2; // Center vertically
    }
    
    // Clip to terminal area only
    ctx.beginPath();
    ctx.rect(pfpX, pfpY, pfpWidth, pfpHeight);
    ctx.clip();
    
    // Draw PFP
    ctx.drawImage(pfpImg, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
    
    // Draw encrypted code overlay
    if (frame > 30) {
        drawEncryptedCode(ctx, pfpX, pfpY, pfpWidth, pfpHeight, frame);
    }
}

// ==========================================
// HELPERS
// ==========================================
function drawTerminalHeader(ctx, width) {
    // Header background
    ctx.fillStyle = '#d893c3ff';
    ctx.fillRect(0, 50, width, 80);
    
    // Dots
    const dotY = 90;
    ctx.fillStyle = '#ff5f56';
    ctx.beginPath();
    ctx.arc(50, dotY, 8, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#ffbd2e';
    ctx.beginPath();
    ctx.arc(90, dotY, 8, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#27c93f';
    ctx.beginPath();
    ctx.arc(130, dotY, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Title
    ctx.fillStyle = '#ffffffff';
    ctx.font = '32px "Fira Code", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SEISMIC://system', width / 2, 95);
}

function drawEncryptedCode(ctx, x, y, w, h, frame) {
    const chars = 'S$E@I1{S}M#I!C[';
    const fontSize = 32;
    const columns = Math.floor(w / fontSize);
    const rows = Math.floor(h / fontSize);
    
    ctx.font = `${fontSize}px "Fira Code", monospace`;
    
    // Pulsing opacity
    const time = frame * 0.05;
    const sineValue = Math.sin(time);
    const opacity = sineValue > 0 
        ? 0.7 + (sineValue * sineValue * 0.15)
        : 0.7 + (sineValue * 0.15);
    
    // ANIMATED NEON PULSE - Multiple colors
    const glowIntensity = opacity * 30; // Stronger pulse
    const glowColor = sineValue > 0 
        ? '#ffffff' // Pink when bright
        : '#ffffff'; // Purple when dim
    
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowIntensity;
    ctx.fillStyle = '#a86b94'; // White text for neon effect
    ctx.globalAlpha = opacity;
    
    // Draw grid
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
            const charIndex = (row * columns + col + Math.floor(frame / 10)) % chars.length;
            const char = chars[charIndex];
            const charX = x + col * fontSize + 19;
            const charY = y + (row + 1) * fontSize;
            
            if (charY > y && charY < y + h) {
                // Draw with double glow for extra neon effect
                ctx.shadowBlur = glowIntensity * 1.5;
                ctx.fillText(char, charX, charY);
                ctx.shadowBlur = glowIntensity * 0.5;
                ctx.fillText(char, charX, charY);
            }
        }
    }
    
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1.0;
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

// ==========================================
// DOWNLOAD HANDLERS
// ==========================================

// WebM Download
document.getElementById('downloadWebM').addEventListener('click', function() {
    if (!recordedWebMBlob) {
        alert('No video recorded!');
        return;
    }
    
    const url = URL.createObjectURL(recordedWebMBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seismic-${formData.username}-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    document.getElementById('statusText').textContent = '✅ WebM downloaded!';
});

// MP4 Conversion & Download
document.getElementById('convertMP4').addEventListener('click', async function() {
    if (!recordedWebMBlob) {
        alert('No video recorded!');
        return;
    }
    
    const btn = this;
    const originalHTML = btn.innerHTML;
    
    try {
        btn.disabled = true;
        btn.innerHTML = '<span>Converting...</span>';
        
        // Convert WebM to MP4
        const mp4Blob = await convertWebMtoMP4(recordedWebMBlob, (status) => {
            document.getElementById('statusText').textContent = status;
        });
        
        if (mp4Blob) {
            // Download MP4
            const url = URL.createObjectURL(mp4Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `seismic-${formData.username}-${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            document.getElementById('statusText').textContent = '✅ MP4 downloaded!';
        } else {
            document.getElementById('statusText').textContent = '❌ Conversion failed. Download WebM instead.';
        }
    } catch (err) {
        console.error('MP4 conversion error:', err);
        document.getElementById('statusText').textContent = '❌ Conversion failed. Download WebM instead.';
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
});
