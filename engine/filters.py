# engine/filters.py
import math
import time

class OneEuroFilter:
    def __init__(self, min_cutoff=1.0, beta=0.0, d_cutoff=1.0):
        """
        min_cutoff: Min cutoff frequency in Hz (Lower = More smoothing for slow speeds)
        beta: Speed coefficient (Higher = Less lag for fast speeds)
        """
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        
        self.x_prev = None
        self.dx_prev = 0.0
        self.t_prev = None

    def smoothing_factor(self, t_e, cutoff):
        r = 2 * math.pi * cutoff * t_e
        return r / (r + 1)

    def exponential_smoothing(self, a, x, x_prev):
        return a * x + (1 - a) * x_prev

    def filter(self, x, t):
        """
        x: The noisy value (e.g., current EAR)
        t: The current timestamp
        """
        if self.t_prev is None:
            self.t_prev = t
            self.x_prev = x
            self.dx_prev = 0.0
            return x

        # Calculate time elapsed (dt)
        t_e = t - self.t_prev
        
        # Avoid division by zero if updates are too fast
        if t_e <= 0.0: return self.x_prev

        # Calculate the derivative (Speed of change)
        ad = self.smoothing_factor(t_e, self.d_cutoff)
        dx = (x - self.x_prev) / t_e
        dx_hat = self.exponential_smoothing(ad, dx, self.dx_prev)

        # Update cutoff frequency based on speed
        # If speed (dx_hat) is high, cutoff increases -> Less smoothing, less lag
        cutoff = self.min_cutoff + self.beta * abs(dx_hat)
        
        # Filter the main signal
        a = self.smoothing_factor(t_e, cutoff)
        x_hat = self.exponential_smoothing(a, x, self.x_prev)

        # Store for next frame
        self.x_prev = x_hat
        self.dx_prev = dx_hat
        self.t_prev = t

        return x_hat