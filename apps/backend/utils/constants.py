"""
Constants used across the ELO calculation system.
"""

# ELO calculation constants
K = 40  # K-factor for global ELO ratings
SEASON_K = 10  # K-factor for season ratings (more stable)
INITIAL_ELO = 1200
USE_POINT_DIFFERENTIAL = False  # Set to True to factor in margin of victory
