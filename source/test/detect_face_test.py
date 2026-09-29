import importlib.util
import pathlib
import unittest
spec = importlib.util.spec_from_file_location('detector', pathlib.Path(__file__).resolve().parent.parent / 'agent/detect-face.py')
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)

class OrientationTests(unittest.TestCase):
    def face(self, angle, box, score):
        return dict(zip(('x', 'y', 'width', 'height'), box), rotation=angle, score=score)

    def test_original_coordinates_all_rotations(self):
        for angle, box in [(0, (10, 20, 60, 80)), (90, (500, 10, 80, 60)),
                           (180, (330, 500, 60, 80)), (270, (20, 330, 80, 60))]:
            self.assertEqual(d.original_box(self.face(angle, box, .95), 400, 600), (10, 20, 60, 80))

    def test_same_portrait_at_opposite_angles_selects_clear_winner(self):
        a = self.face(0, (10, 20, 60, 80), .95)
        b = self.face(180, (330, 500, 60, 80), .89)
        self.assertEqual(d.choose_face([b, a], 400, 600), a)
        b['score'] = .94
        self.assertEqual(d.choose_face([a, b], 400, 600)['error'], 'ambiguous_orientation')

    def test_separate_faces_rejected_even_when_one_has_a_higher_score(self):
        a = self.face(0, (10, 20, 60, 80), .99)
        b = self.face(180, (30, 30, 60, 80), .85)
        self.assertEqual(d.choose_face([a, b], 400, 600)['error'], 'multiple_faces')
        self.assertEqual(d.choose_face([], 400, 600)['error'], 'no_face')

if __name__ == '__main__':
    unittest.main()
