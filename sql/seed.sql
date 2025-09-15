INSERT IGNORE INTO reward_tiers (id, code, name, description, cost_points, priority) VALUES
(UUID(), 'ACCOMP', 'Acompañamiento', 'Acompañamiento', 300, 1),
(UUID(), 'SIMPLE', 'Cheeseburger Simple', 'Cheeseburger Simple', 600, 2),
(UUID(), 'DOBLE', 'Cheeseburger Doble', 'Cheeseburger Doble', 900, 3),
(UUID(), 'COMBO', 'Combo (cualquier)', 'Combo (cualquier)', 1200, 4),
(UUID(), 'TRIPLE', 'Cheeseburger Triple', 'Cheeseburger Triple', 1500, 5),
(UUID(), 'COMBO_TRIPLE', 'Combo de Triple', 'Combo de Triple', 1800, 6),
(UUID(), 'COMBO_TRIPLE_EDIT', 'Combo de Triple editable', 'Combo de Triple editable', 2000, 7),
(UUID(), 'ANY_COMBO_ACC', 'Cualquier combo + acompañamiento', 'Cualquier combo + acompañamiento', 2200, 8);