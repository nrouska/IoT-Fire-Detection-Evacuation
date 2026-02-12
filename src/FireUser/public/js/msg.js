var msgdiv = document.getElementById("msg");

fetch("https://admin.fireproject.sveronis.net/api/notifications")
    .then(res => res.json())
    .then(data => {
        msgdiv.innerHTML = data.text;
        startAnimation()
    })
    .catch(err => console.error(err));

function startAnimation () {
    // Configuration
    const selector = '#msg';
    const pixelsPerSecond = 50; // positive -> scroll leftwards (like news tickers)

    // Wait for DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        const footer = document.querySelector(selector);
        if (!footer) {
            // nothing to do
            return;
        }

        // Ensure we only initialize once
        if (footer.__tickerInitialized) return;
        footer.__tickerInitialized = true;

        // Basic inline styles (all applied via JS because user asked for JS only)
        footer.style.overflow = 'hidden';
        footer.style.position = footer.style.position || 'relative';
        footer.style.boxSizing = 'border-box';
        footer.style.whiteSpace = 'nowrap';
        footer.style.display = 'block';

        // Grab the original content (preserve HTML)
        const originalHTML = footer.innerHTML.trim();

        // Create ticker inner wrapper and two copies for seamless loop
        const track = document.createElement('div');
        const copyA = document.createElement('div');
        const copyB = document.createElement('div');

        // Apply styles to track and copies
        Object.assign(track.style, {
            display: 'inline-block',
            whiteSpace: 'nowrap',
            willChange: 'transform',
            position: 'relative',
        });

        const copyBaseStyle = {
            display: 'inline-block',
            whiteSpace: 'nowrap',
            verticalAlign: 'top',
        };
        Object.assign(copyA.style, copyBaseStyle);
        Object.assign(copyB.style, copyBaseStyle);

        // Put the HTML into both copies
        copyA.innerHTML = originalHTML;
        copyB.innerHTML = originalHTML;

        // Clear footer and append track with two copies
        footer.innerHTML = '';
        track.appendChild(copyA);
        track.appendChild(copyB);
        footer.appendChild(track);

        // Small spacer between repeats: if the content is very long it's optional; we insert it to avoid jamming
        const spacer = 30; // pixels gap between repeated contents
        copyA.style.marginRight = spacer + 'px';

        // After rendering, measure widths
        // Force a reflow to ensure measurements are accurate
        requestAnimationFrame(() => {
            const aWidth = copyA.getBoundingClientRect().width;
            const bWidth = copyB.getBoundingClientRect().width;

            // If content width is smaller than container, we might want to repeat more times to avoid long empty gaps.
            // Compute minimum repeats so that track width >= container width + content width (for seamless scroll).
            const containerWidth = footer.getBoundingClientRect().width;
            let repeats = 9999;
            if (aWidth < containerWidth) {
                repeats = Math.ceil((containerWidth + aWidth) / aWidth) + 1;
            }

            // If repeats > 2, recreate copies accordingly
            if (repeats > 2) {
                track.innerHTML = '';
                for (let i = 0; i < repeats; i++) {
                    const c = document.createElement('div');
                    Object.assign(c.style, copyBaseStyle);
                    c.innerHTML = originalHTML;
                    if (i < repeats - 1) c.style.marginRight = spacer + 'px';
                    track.appendChild(c);
                }
            }

            // Re-measure total track (sum of children widths)
            const children = Array.from(track.children);
            let totalTrackWidth = children.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0);

            // If for any reason totalTrackWidth is zero (empty content), don't run animation
            if (!totalTrackWidth) return;

            // Animation state
            let x = 0; // current translateX (negative moves left)
            let lastTime = performance.now();
            let paused = false;

            // Pause on hover
            footer.addEventListener('mouseenter', () => (paused = true));
            footer.addEventListener('mouseleave', () => (paused = false));
            // Also pause when window/tab not visible
            document.addEventListener('visibilitychange', () => {
                paused = document.hidden;
            });

            // Use requestAnimationFrame for smooth movement; reset when we've moved one full repeat
            function step(now) {
                const dt = Math.max(0, now - lastTime) / 1000; // seconds
                lastTime = now;
                if (!paused) {
                    x -= pixelsPerSecond * dt; // move left
                    // When we've scrolled past the width of the first child (or the smallest repeating block),
                    // wrap x by adding totalTrackWidth until it's between -totalTrackWidth and 0.
                    if (Math.abs(x) >= totalTrackWidth) {
                        // keep x within [-totalTrackWidth, 0)
                        x += Math.ceil(Math.abs(x) / totalTrackWidth) * totalTrackWidth;
                    }
                    // apply transform
                    track.style.transform = `translateX(${x}px)`;
                }
                requestAnimationFrame(step);
            }

            // Start animation
            lastTime = performance.now();
            requestAnimationFrame(step);

            // Make ticker responsive: recompute widths on resize or font changes
            let resizeTimer = null;
            const recompute = () => {
                // remove transform, remeasure children widths
                track.style.transform = 'translateX(0px)';
                x = 0;
                // small timeout to allow layout to settle
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    const currentChildren = Array.from(track.children);
                    totalTrackWidth = currentChildren.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) || totalTrackWidth;
                }, 50);
            };

            window.addEventListener('resize', recompute);
            // Also listen for fonts loading (optional)
            if (document.fonts && document.fonts.addEventListener) {
                document.fonts.addEventListener('loadingdone', recompute);
            }
        });
    }
}
